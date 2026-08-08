import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type {
  BehaviorContract,
  BehaviorScenario,
  BehaviorStep,
  ReadyArtifactMetadata,
  ScenarioResult,
} from "./protocol.js";
import {
  assertProjectPolicy,
  assertUtilityFormatMarker,
  createUtilityFormatMarker,
  sourceDigest,
  writeEditableProjectFile,
} from "./targets.js";

const maximumOutputBytes = 64 * 1024;
const behaviorPassLimitMs = 45_000;
const defaultViewLabel = "main-canvas";

export type RepairScope = "source" | "scenario" | "host";

export class AdapterFailure extends Error {
  readonly repairScope: RepairScope;

  constructor(repairScope: RepairScope, message: string) {
    super(message);
    this.name = "AdapterFailure";
    this.repairScope = repairScope;
  }
}

export type StageOutcome = {
  stage: "node_version" | "native_version" | "native_test" | "native_check";
  summary: string;
  durationMs: number;
  ok: true;
};

export type ValidationOutcome = StageOutcome[] & {
  sourceDigest: string;
  modelContractRefreshed: boolean;
};

export type NativeCandidate = {
  sourceDigest: string;
  binaryDigest: string;
  assetsDigest: string;
  automationProtocol: string;
};

export type ScenarioVerificationOutcome = {
  candidate: NativeCandidate;
  scenarioResult: ScenarioResult;
  screenshots: string[];
  runtimeLogs: string[];
};

export type VerificationOutcome = {
  sourceDigest: string;
  candidate: NativeCandidate;
  scenarioResults: ScenarioResult[];
  screenshots: string[];
  runtimeLogs: string[];
};

export type FinalizationInputs = {
  formatMarkerDigest: string;
  sourceDigest: string;
  verifiedBinaryDigest: string;
  verifiedAssetsDigest: string;
  verificationEvidenceDigest: string;
  packagedBinaryDigest: string;
  artifactDigest: string;
  launchEvidenceDigest: string;
};

export type FinalizationOutcome = {
  artifact: ReadyArtifactMetadata;
  launchDurationMs: number;
  attestationInputs: FinalizationInputs;
};

export type BoundedNativeAdapterOptions = {
  nodeExecutable?: string;
  nativeCliPath?: string;
  nativeZigPath?: string;
  nativeSdkHome?: string;
  utilityRoot?: string;
  nativeExecutable?: string;
  projectRoot: string;
  evidenceRoot: string;
  releaseRoot: string;
};

type CommandResult = { stdout: string; stderr: string; durationMs: number };

class CommandFailure extends Error {
  readonly output: string;

  constructor(message: string, output: string) {
    super(message);
    this.output = output;
  }
}

function boundedAppend(current: string, chunk: Buffer): string {
  const used = Buffer.byteLength(current);
  if (used >= maximumOutputBytes) return current;
  return current + chunk.subarray(0, maximumOutputBytes - used).toString("utf8");
}

function abortError(): Error {
  const error = new Error("operation cancelled");
  error.name = "AbortError";
  return error;
}

async function runCommand(
  executable: string,
  args: string[],
  cwd: string,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<CommandResult> {
  if (signal.aborted) throw abortError();
  const started = performance.now();
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env: environment, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error?: Error, result?: CommandResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(result!);
    };
    const stop = (reason: Error): void => {
      child.kill("SIGTERM");
      finish(reason);
    };
    const onAbort = (): void => stop(abortError());
    const timer = setTimeout(() => stop(new CommandFailure(`command exceeded ${timeoutMs} ms`, `${stdout}\n${stderr}`)), timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = boundedAppend(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = boundedAppend(stderr, chunk);
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code, processSignal) => {
      const result = { stdout, stderr, durationMs: Math.round(performance.now() - started) };
      if (code !== 0) {
        finish(new CommandFailure(`command failed (${code ?? processSignal ?? "unknown"})`, `${stdout}\n${stderr}`));
      } else {
        finish(undefined, result);
      }
    });
  });
}

function safeName(value: string): string {
  const result = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!result) throw new AdapterFailure("scenario", "evidence name must contain a letter or number");
  return result.slice(0, 80);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function explicitWidgetTarget(value: string): [string, string] | undefined {
  const match = /^([A-Za-z][A-Za-z0-9_-]*)#([1-9][0-9]*)$/.exec(value);
  return match ? [match[1]!, match[2]!] : undefined;
}

function validateScenario(scenario: BehaviorScenario): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(scenario.id)) {
    throw new AdapterFailure("scenario", `invalid Behavior Scenario id: ${scenario.id}`);
  }
  if (scenario.steps.length < 1 || scenario.steps.length > 30) {
    throw new AdapterFailure("scenario", `${scenario.id} must contain 1 to 30 steps`);
  }
  for (const step of scenario.steps) {
    if (step.action === "wait") {
      throw new AdapterFailure("scenario", "replace fixed waits with native automate assert polling");
    }
    if (
      (step.action === "click" || step.action === "input") &&
      (step.target.length > 200 || /[\r\n"\0]/.test(step.target))
    ) {
      throw new AdapterFailure("scenario", "widget targets must be bounded single-line labels");
    }
    if (step.action === "input" && Buffer.byteLength(step.value) > 2_000) {
      throw new AdapterFailure("scenario", "scenario input exceeds 2000 bytes");
    }
    if (step.action === "screenshot") safeName(step.name);
  }
}

async function preflightSource(projectRoot: string): Promise<void> {
  const markup = await readFile(path.join(projectRoot, "src", "app.native"), "utf8");
  const core = await readFile(path.join(projectRoot, "src", "core.ts"), "utf8");
  const diagnostics: string[] = [];
  if (/\s\bid=\"/.test(markup)) diagnostics.push('src/app.native uses unsupported HTML id attributes; remove every id and use a unique label matching each Behavior Scenario target');
  if (/\{\s*!/.test(markup)) diagnostics.push('src/app.native uses JavaScript ! negation; markup expressions use "not value"');
  if (/<else-if\b/.test(markup)) diagnostics.push("src/app.native uses unsupported <else-if>; nest <if> inside <else>");
  if (/<for\b[^>]*\beach=\"\{[^}]+\}\"/.test(markup)) diagnostics.push('src/app.native wraps a for iterable in binding braces; use each="rows"');
  if (/<for\b[^>]*\beach=\"[A-Za-z_$][\w$]*\.[^\"]+\"/.test(markup)) diagnostics.push("src/app.native loops over an alias member; expose one top-level iterable instead");
  if (/<(?:input|textarea)\b[^>]*\bvalue=\"\{[^}]+\}\"/.test(markup)) diagnostics.push('src/app.native binds editable text through value; use text="{field}"');
  if (/<(?:text-field|input|search-field|combobox|textarea)\b[^>]*\bon-change=/.test(markup)) diagnostics.push("src/app.native uses on-change on editable text; use on-input with TextInputEvent");
  if (/<(?:text-field|input|search-field|combobox|textarea)\b[^>]*\bon-input=\"[^\"]*:\{/.test(markup)) diagnostics.push("src/app.native interpolates a value into on-input; dispatch one plain message tag");
  if (/\bon-(?:press|dismiss|toggle)=\"[a-z][a-z0-9_]*:\{['\"]/.test(markup)) diagnostics.push('src/app.native wraps a constant message payload in binding braces; use tag:value for constants and reserve tag:{binding} for one model binding');
  if (/<text\b[^>]*\blabel=\"/.test(markup)) diagnostics.push('src/app.native puts an accessibility label directly on text; Native automation replaces the visible text with that label, so put the scenario label on a container around an unlabeled text node');
  if (/\b(?:width|height)=\"0(?:\.0+)?\"/.test(markup)) diagnostics.push('src/app.native uses a zero-size widget to hide a binding; remove the invisible widget and list legitimately update-only state or host-fired messages in TypeScript viewUnbound');
  if (/export\s+const\s+view_unbound\b/.test(core)) diagnostics.push('src/core.ts uses Zig spelling view_unbound; TypeScript requires export const viewUnbound = ["fieldName", "messageKind"] as const');
  const modelBlock = core.match(/export\s+interface\s+Model\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  if (/readonly\s+[A-Za-z_$][\w$]*\s*:\s*TextEditState\b/.test(modelBlock)) diagnostics.push("src/core.ts stores imported TextEditState in Model; keep a flat app-owned byte/edit record and construct TextEditState locally");
  for (const match of markup.matchAll(/<(?:text-field|input|search-field|combobox|textarea)\b[^>]*\bon-input=\"([a-z][a-z0-9_]*)\"/g)) {
    const tag = match[1] ?? "";
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`readonly\\s+kind\\s*:\\s*[\"']${escaped}[\"'][^}]{0,240}TextInputEvent`).test(core)) diagnostics.push(`src/core.ts message ${tag} must carry TextInputEvent because markup uses it as on-input`);
  }
  if (diagnostics.length > 0) throw new AdapterFailure("source", `Host preflight failed:\n- ${diagnostics.join("\n- ")}`);
}

function remainingMs(deadline: number): number {
  const remaining = Math.floor(deadline - performance.now());
  if (remaining <= 0) throw new AdapterFailure("source", "Behavior Contract exceeded its 45-second execution limit");
  return remaining;
}

async function sha256File(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function canonicalDirectoryDigest(root: string): Promise<string> {
  const files: string[] = [];
  async function visit(relativeDirectory: string): Promise<void> {
    for (const entry of await readdir(path.join(root, relativeDirectory), { withFileTypes: true })) {
      const file = path.posix.join(relativeDirectory, entry.name);
      if (entry.isSymbolicLink()) throw new AdapterFailure("host", `symlink in digest input: ${file}`);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  await visit("");
  const digest = createHash("sha256");
  for (const file of files.sort()) {
    const contents = await readFile(path.join(root, file));
    digest.update(`${file.length}:${file}:${contents.length}:`);
    digest.update(contents);
  }
  return digest.digest("hex");
}

async function optionalAssetsDigest(root: string): Promise<string> {
  try {
    const entry = await lstat(root);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new AdapterFailure("host", "Native assets output is not a regular directory");
    }
    return await canonicalDirectoryDigest(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createHash("sha256").update("").digest("hex");
    }
    throw error;
  }
}

function stopProcess(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
}

export class BoundedNativeAdapter {
  readonly nodeExecutable: string;
  readonly nativeCliPath: string;
  readonly nativeZigPath: string;
  readonly nativeSdkHome: string;
  readonly utilityRoot: string;
  readonly projectRoot: string;
  readonly evidenceRoot: string;
  readonly releaseRoot: string;
  private automationProtocol: string | undefined;
  private modelContractCoreDigest: string | undefined;
  private validatedDigest: string | undefined;
  private candidate: NativeCandidate | undefined;
  private verificationSealed = false;
  private verificationElapsedMs = 0;
  private scenarioResults = new Map<string, ScenarioResult>();
  private screenshots = new Set<string>();
  private runtimeLogs = new Set<string>();
  private lastSourceFailure: AdapterFailure | undefined;
  private finalized = false;

  constructor(options: BoundedNativeAdapterOptions) {
    this.nodeExecutable = path.resolve(options.nodeExecutable ?? process.execPath);
    this.nativeCliPath = path.resolve(options.nativeCliPath ?? options.nativeExecutable ?? "native");
    this.nativeZigPath = path.resolve(options.nativeZigPath ?? process.env.NATIVE_SDK_ZIG ?? "zig");
    this.nativeSdkHome = path.resolve(options.nativeSdkHome ?? process.env.NATIVE_SDK_HOME ?? path.join(options.projectRoot, ".native-home"));
    this.utilityRoot = path.resolve(options.utilityRoot ?? path.dirname(options.projectRoot));
    this.projectRoot = path.resolve(options.projectRoot);
    this.evidenceRoot = path.resolve(options.evidenceRoot);
    this.releaseRoot = path.resolve(options.releaseRoot);
  }

  private environment(runtimeLogDirectory?: string): NodeJS.ProcessEnv {
    const environment: NodeJS.ProcessEnv = {
      PATH: `${path.dirname(this.nodeExecutable)}:/usr/bin:/bin:/usr/sbin:/sbin`,
      NATIVE_SDK_ZIG: this.nativeZigPath,
      NATIVE_SDK_HOME: this.nativeSdkHome,
    };
    for (const name of ["HOME", "LANG", "LC_ALL", "TMPDIR"]) {
      if (process.env[name] !== undefined) environment[name] = process.env[name];
    }
    if (runtimeLogDirectory) environment.NATIVE_SDK_LOG_DIR = runtimeLogDirectory;
    return environment;
  }

  private runNative(args: string[], signal: AbortSignal, timeoutMs: number): Promise<CommandResult> {
    return runCommand(
      this.nodeExecutable,
      [this.nativeCliPath, ...args],
      this.projectRoot,
      this.environment(),
      signal,
      timeoutMs,
    );
  }

  async scaffold(signal: AbortSignal): Promise<void> {
    if (this.finalized) throw new Error("adapter is finalized");
    await mkdir(this.utilityRoot, { recursive: true });
    const temporary = path.join(this.utilityRoot, "generated-app");
    if (temporary === this.projectRoot) {
      throw new AdapterFailure("host", "projectRoot must differ from the native init staging path");
    }
    try {
      if ((await readdir(this.projectRoot)).length > 0) {
        throw new AdapterFailure("host", "Utility source destination must be empty");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await lstat(temporary);
      throw new AdapterFailure("host", "Native scaffold staging path already exists");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await runCommand(
        this.nodeExecutable,
        [this.nativeCliPath, "init", temporary, "--template", "ts-core", "--frontend", "native"],
        this.utilityRoot,
        this.environment(),
        signal,
        30_000,
      );
      await rename(temporary, this.projectRoot);
      await createUtilityFormatMarker(this.utilityRoot, "native-bounded");
      await assertProjectPolicy(this.projectRoot, "native-bounded");
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      throw error instanceof AdapterFailure
        ? error
        : new AdapterFailure("host", error instanceof Error ? error.message : "Native scaffold failed");
    }
  }

  async writeSource(relativePath: string, contents: string): Promise<void> {
    if (this.finalized) throw new Error("adapter is finalized");
    if (this.verificationSealed) {
      throw new Error("source edits are sealed; a source-scoped failure must reopen repair first");
    }
    await this.invalidateLaterEvidence();
    await writeEditableProjectFile(this.projectRoot, "native-bounded", relativePath, contents);
    this.validatedDigest = undefined;
    if (relativePath === "src/core.ts") this.modelContractCoreDigest = undefined;
  }

  async validate(signal: AbortSignal): Promise<ValidationOutcome> {
    if (this.finalized) throw new Error("adapter is finalized");
    try {
      await assertUtilityFormatMarker(this.utilityRoot, "native-bounded");
      await assertProjectPolicy(this.projectRoot, "native-bounded");
      const stages: StageOutcome[] = [];
      const node = await runCommand(
        this.nodeExecutable,
        ["--version"],
        this.projectRoot,
        this.environment(),
        signal,
        5_000,
      );
      if (node.stdout.trim() !== "v24.18.1") {
        throw new AdapterFailure("host", `bundled Node 24.18.1 is required, received ${node.stdout.trim()}`);
      }
      stages.push({ stage: "node_version", summary: "Node 24.18.1", durationMs: node.durationMs, ok: true });
      const version = await this.runNative(["version"], signal, 5_000);
      const versionMatch = /^native 0\.8\.1 .*automation protocol (0x[0-9a-f]+)\)?$/im.exec(version.stdout.trim());
      if (!versionMatch) throw new AdapterFailure("host", "bundled Native 0.8.1 with automation protocol is required");
      this.automationProtocol = versionMatch[1]!;
      stages.push({
        stage: "native_version",
        summary: `Native 0.8.1, automation protocol ${this.automationProtocol}`,
        durationMs: version.durationMs,
        ok: true,
      });
      await preflightSource(this.projectRoot);
      const coreDigest = await sha256File(path.join(this.projectRoot, "src", "core.ts"));
      const modelContractRefreshed = coreDigest !== this.modelContractCoreDigest;
      if (modelContractRefreshed) {
        const test = await this.runNative(["test", "--yes"], signal, 120_000);
        stages.push({ stage: "native_test", summary: "Native model contract refreshed", durationMs: test.durationMs, ok: true });
        this.modelContractCoreDigest = coreDigest;
      }
      const check = await this.runNative(["check", "--strict"], signal, 30_000);
      stages.push({ stage: "native_check", summary: "Native strict check passed", durationMs: check.durationMs, ok: true });
      this.validatedDigest = await sourceDigest(this.projectRoot, "native-bounded");
      return Object.assign(stages, { sourceDigest: this.validatedDigest, modelContractRefreshed });
    } catch (error) {
      if (error instanceof AdapterFailure || (error instanceof Error && error.name === "AbortError")) throw error;
      const output = error instanceof CommandFailure ? error.output : error instanceof Error ? error.message : "validation failed";
      throw new AdapterFailure("source", this.sanitize(output).slice(0, 12 * 1024));
    }
  }

  async verifyScenario(
    scenario: BehaviorScenario,
    signal: AbortSignal,
  ): Promise<ScenarioVerificationOutcome> {
    if (this.finalized) throw new Error("adapter is finalized");
    validateScenario(scenario);
    const currentDigest = await sourceDigest(this.projectRoot, "native-bounded");
    if (!this.validatedDigest || currentDigest !== this.validatedDigest) {
      throw new AdapterFailure("source", "source must pass validate_app before verification");
    }
    await assertUtilityFormatMarker(this.utilityRoot, "native-bounded");
    this.verificationSealed = true;
    const candidate = await this.buildOrReuseCandidate(signal);
    const started = performance.now();
    const deadline = performance.now() + (behaviorPassLimitMs - this.verificationElapsedMs);
    try {
      const outcome = await this.executeScenario(scenario, candidate, deadline, signal);
      this.verificationElapsedMs += performance.now() - started;
      this.scenarioResults.set(scenario.id, outcome.scenarioResult);
      for (const screenshot of outcome.screenshots) this.screenshots.add(screenshot);
      for (const log of outcome.runtimeLogs) this.runtimeLogs.add(log);
      await this.writeVerificationEvidence(candidate);
      return outcome;
    } catch (error) {
      const failure = error instanceof AdapterFailure
        ? error
        : new AdapterFailure("host", this.sanitize(error instanceof Error ? error.message : "verification failed"));
      this.verificationElapsedMs += performance.now() - started;
      if (failure.repairScope === "source") this.lastSourceFailure = failure;
      await this.writeVerificationEvidence(candidate, failure);
      throw failure;
    }
  }

  async verify(contract: BehaviorContract, signal: AbortSignal): Promise<VerificationOutcome> {
    if (contract.scenarios.length < 1 || contract.scenarios.length > 3) {
      throw new AdapterFailure("scenario", "Behavior Contract must contain one to three scenarios");
    }
    const seen = new Set<string>();
    for (const scenario of contract.scenarios) {
      if (seen.has(scenario.id)) throw new AdapterFailure("scenario", `duplicate scenario id: ${scenario.id}`);
      seen.add(scenario.id);
      await this.verifyScenario(scenario, signal);
    }
    return {
      sourceDigest: this.validatedDigest!,
      candidate: this.candidate!,
      scenarioResults: contract.scenarios.map((scenario) => this.scenarioResults.get(scenario.id)!),
      screenshots: [...this.screenshots].sort(),
      runtimeLogs: [...this.runtimeLogs].sort(),
    };
  }

  async reopenSourceRepair(failure: AdapterFailure): Promise<void> {
    if (this.finalized) throw new Error("adapter is finalized");
    if (failure !== this.lastSourceFailure || failure.repairScope !== "source") {
      throw new Error("only the adapter's latest source-scoped verification failure can reopen editing");
    }
    this.verificationSealed = false;
    this.lastSourceFailure = undefined;
    await this.invalidateLaterEvidence();
  }

  async finalize(
    requiredScenarioIds: readonly string[],
    signal: AbortSignal,
  ): Promise<FinalizationOutcome> {
    if (this.finalized) throw new Error("adapter is finalized");
    const candidate = this.candidate;
    if (!candidate || !this.validatedDigest) throw new AdapterFailure("source", "verified candidate is missing");
    const uniqueRequired = [...new Set(requiredScenarioIds)];
    if (uniqueRequired.length < 1 || uniqueRequired.some((id) => !this.scenarioResults.get(id)?.passed)) {
      throw new AdapterFailure("scenario", "every required Behavior Scenario must pass before finalization");
    }
    const currentDigest = await sourceDigest(this.projectRoot, "native-bounded");
    const binary = path.join(this.projectRoot, "zig-out", "bin", "generated-app");
    const assets = path.join(this.projectRoot, "zig-out", "assets.bundle");
    if (
      currentDigest !== candidate.sourceDigest ||
      await sha256File(binary) !== candidate.binaryDigest ||
      await optionalAssetsDigest(assets) !== candidate.assetsDigest
    ) {
      await this.invalidateLaterEvidence();
      const failure = new AdapterFailure("source", "source or candidate changed after verification");
      this.lastSourceFailure = failure;
      throw failure;
    }
    try {
      const formatMarkerDigest = await assertUtilityFormatMarker(this.utilityRoot, "native-bounded");
      await rm(this.releaseRoot, { recursive: true, force: true });
      await mkdir(this.releaseRoot, { recursive: true });
      const application = path.join(this.releaseRoot, "Generated App.app");
      const packageArguments = [
        "package", "--target", "macos", "--output", application,
        "--binary", binary,
      ];
      try {
        if ((await lstat(assets)).isDirectory()) packageArguments.push("--assets", assets);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      packageArguments.push("--signing", "adhoc");
      await this.runNative(packageArguments, signal, 60_000);
      const executables = await readdir(path.join(application, "Contents", "MacOS"));
      if (executables.length !== 1) throw new AdapterFailure("host", "package must contain one executable");
      const packagedExecutable = path.join(application, "Contents", "MacOS", executables[0]!);
      if (!(await lstat(packagedExecutable)).isFile()) throw new AdapterFailure("host", "packaged executable is invalid");
      const packagedBinaryDigest = await sha256File(packagedExecutable);
      const artifactDigest = await canonicalDirectoryDigest(application);
      const launchStarted = performance.now();
      await runCommand(
        "/usr/bin/open",
        ["-n", application],
        this.releaseRoot,
        this.environment(),
        signal,
        10_000,
      );
      const processProbe = await runCommand(
        "/usr/bin/pgrep",
        ["-f", packagedExecutable],
        this.releaseRoot,
        this.environment(),
        signal,
        5_000,
      );
      if (!/^\d+/m.test(processProbe.stdout)) throw new AdapterFailure("host", "packaged Utility did not remain running");
      const launchDurationMs = Math.round(performance.now() - launchStarted);
      const launchEvidence = JSON.stringify({ openedByLaunchServices: true, remainedRunning: true, launchDurationMs });
      const verificationEvidenceDigest = await canonicalDirectoryDigest(this.evidenceRoot);
      const attestationInputs: FinalizationInputs = {
        formatMarkerDigest,
        sourceDigest: candidate.sourceDigest,
        verifiedBinaryDigest: candidate.binaryDigest,
        verifiedAssetsDigest: candidate.assetsDigest,
        verificationEvidenceDigest,
        packagedBinaryDigest,
        artifactDigest,
        launchEvidenceDigest: createHash("sha256").update(launchEvidence).digest("hex"),
      };
      const artifact: ReadyArtifactMetadata = {
        path: path.relative(this.releaseRoot, application),
        sourceDigest: candidate.sourceDigest,
        binaryDigest: packagedBinaryDigest,
      };
      await writeFile(
        path.join(this.evidenceRoot, "finalization-inputs.json"),
        `${JSON.stringify({ artifact, launchDurationMs, attestationInputs }, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      this.finalized = true;
      return { artifact, launchDurationMs, attestationInputs };
    } catch (error) {
      if (error instanceof AdapterFailure || (error instanceof Error && error.name === "AbortError")) throw error;
      const output = error instanceof CommandFailure ? error.output : error instanceof Error ? error.message : "finalization failed";
      throw new AdapterFailure("host", this.sanitize(output).slice(0, 12 * 1024));
    }
  }

  async buildReleaseAndLaunch(
    verifiedDigest: string,
    signal: AbortSignal,
  ): Promise<FinalizationOutcome> {
    if (verifiedDigest !== this.validatedDigest) {
      throw new AdapterFailure("source", "verified digest does not match the adapter's validated source");
    }
    return this.finalize([...this.scenarioResults.keys()], signal);
  }

  private async buildOrReuseCandidate(signal: AbortSignal): Promise<NativeCandidate> {
    const binary = path.join(this.projectRoot, "zig-out", "bin", "generated-app");
    const assets = path.join(this.projectRoot, "zig-out", "assets.bundle");
    const existingCandidate = this.candidate;
    if (existingCandidate && existingCandidate.sourceDigest === this.validatedDigest) {
      try {
        if (
          await sha256File(binary) === existingCandidate.binaryDigest &&
          await optionalAssetsDigest(assets) === existingCandidate.assetsDigest
        ) return existingCandidate;
      } catch {
        // Missing or changed candidate is rebuilt once for the validated digest.
      }
    }
    try {
      await this.runNative(["build", "--yes", "-Dautomation=true"], signal, 180_000);
    } catch (error) {
      const output = error instanceof CommandFailure ? error.output : error instanceof Error ? error.message : "candidate build failed";
      const failure = new AdapterFailure("source", this.sanitize(output).slice(0, 12 * 1024));
      this.lastSourceFailure = failure;
      throw failure;
    }
    this.candidate = {
      sourceDigest: this.validatedDigest!,
      binaryDigest: await sha256File(binary),
      assetsDigest: await optionalAssetsDigest(assets),
      automationProtocol: this.automationProtocol!,
    };
    return this.candidate;
  }

  private async executeScenario(
    scenario: BehaviorScenario,
    candidate: NativeCandidate,
    deadline: number,
    signal: AbortSignal,
  ): Promise<ScenarioVerificationOutcome> {
    const scenarioStarted = performance.now();
    const automationRoot = path.join(this.projectRoot, ".zig-cache", "native-sdk-automation");
    await rm(automationRoot, { recursive: true, force: true });
    const logRoot = path.join(this.evidenceRoot, "runtime", safeName(scenario.id));
    await rm(logRoot, { recursive: true, force: true });
    await mkdir(logRoot, { recursive: true });
    const binary = path.join(this.projectRoot, "zig-out", "bin", "generated-app");
    let stdout = "";
    let stderr = "";
    const child = spawn(binary, [], {
      cwd: this.projectRoot,
      env: this.environment(logRoot),
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = boundedAppend(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = boundedAppend(stderr, chunk);
    });
    const onAbort = (): void => stopProcess(child);
    signal.addEventListener("abort", onAbort, { once: true });
    const scenarioScreenshots: string[] = [];
    try {
      const ready = await this.runNative(["automate", "wait"], signal, Math.min(10_000, remainingMs(deadline)));
      const readyLine = ready.stdout.split(/\r?\n/, 1)[0] ?? "";
      if (!readyLine.includes("ready=true")) throw new AdapterFailure("host", "Native automation did not become ready");
      if (!readyLine.includes(`protocol=${candidate.automationProtocol}`)) {
        throw new AdapterFailure("host", "Native automation protocol does not match the verified CLI");
      }
      if (!readyLine.includes("dispatch_errors=0")) throw new AdapterFailure("source", "Native reported dispatch errors at launch");
      for (const step of scenario.steps) {
        await this.executeStep(step, scenario, scenarioScreenshots, deadline, signal);
      }
      if (!scenario.steps.some((step) => step.action === "screenshot")) {
        await this.captureScreenshot(scenario, "final", scenarioScreenshots, deadline, signal);
      }
      const finalSnapshot = await this.runNative(["automate", "snapshot"], signal, remainingMs(deadline));
      const firstLine = finalSnapshot.stdout.split(/\r?\n/, 1)[0] ?? "";
      if (!firstLine.includes("dispatch_errors=0")) throw new AdapterFailure("source", "Native reported dispatch errors");
      const runtimeLogFiles = await this.inspectRuntimeLogs(logRoot);
      const runtimeOutput = this.sanitize(`${stdout}\n${stderr}`).trim();
      if (/(?:panic|runtime error|dispatch error|error:)/i.test(runtimeOutput)) {
        throw new AdapterFailure("source", runtimeOutput.slice(0, 12 * 1024));
      }
      const scenarioResult: ScenarioResult = {
        scenarioId: scenario.id,
        passed: true,
        durationMs: Math.round(performance.now() - scenarioStarted),
        summary: "Accepted scenario passed against the verified ReleaseFast binary with matching protocol and zero runtime or dispatch errors",
        screenshots: scenarioScreenshots,
      };
      return { candidate, scenarioResult, screenshots: scenarioScreenshots, runtimeLogs: runtimeLogFiles };
    } catch (error) {
      if (error instanceof AdapterFailure || (error instanceof Error && error.name === "AbortError")) throw error;
      if (error instanceof CommandFailure) {
        throw new AdapterFailure("source", this.sanitize(error.output).slice(0, 12 * 1024));
      }
      throw new AdapterFailure("host", this.sanitize(error instanceof Error ? error.message : "scenario runner failed"));
    } finally {
      signal.removeEventListener("abort", onAbort);
      stopProcess(child);
    }
  }

  private async executeStep(
    step: BehaviorStep,
    scenario: BehaviorScenario,
    screenshots: string[],
    deadline: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (step.action === "launch") return;
    if (step.action === "wait") throw new AdapterFailure("scenario", "fixed waits are not supported");
    if (step.action === "screenshot") {
      await this.captureScreenshot(scenario, step.name, screenshots, deadline, signal);
      return;
    }
    let args: string[];
    if (step.action === "click" || step.action === "input") {
      const [view, id] = await this.resolveWidgetTarget(step.target, deadline, signal);
      args = step.action === "click"
        ? ["automate", "widget-click", view, id]
        : ["automate", "widget-action", view, id, "set_text", step.value];
    } else if (step.action === "assert_visible") {
      args = ["automate", "assert", "--timeout-ms", String(Math.min(5_000, remainingMs(deadline))), escapeRegex(step.target)];
    } else {
      args = [
        "automate", "assert", "--timeout-ms", String(Math.min(5_000, remainingMs(deadline))),
        escapeRegex(step.target), escapeRegex(step.value),
      ];
    }
    try {
      await this.runNative(args, signal, remainingMs(deadline));
    } catch (error) {
      const output = error instanceof CommandFailure ? error.output : error instanceof Error ? error.message : "automation step failed";
      throw new AdapterFailure(
        step.action === "click" || step.action === "input" ? "scenario" : "source",
        this.sanitize(output).slice(0, 12 * 1024),
      );
    }
  }

  private async resolveWidgetTarget(
    target: string,
    deadline: number,
    signal: AbortSignal,
  ): Promise<[string, string]> {
    const explicit = explicitWidgetTarget(target);
    if (explicit) return explicit;
    const snapshot = await this.runNative(["automate", "snapshot"], signal, remainingMs(deadline));
    const matches: Array<[string, string]> = [];
    for (const line of snapshot.stdout.split(/\r?\n/)) {
      const match = /widget @w1\/([A-Za-z][A-Za-z0-9_-]*)#([1-9][0-9]*)\b.*\bname="([^"]*)"/.exec(line);
      if (match?.[3] === target) matches.push([match[1]!, match[2]!]);
    }
    if (matches.length !== 1) {
      throw new AdapterFailure(
        "scenario",
        matches.length === 0
          ? `no visible widget has the accessible name: ${target}`
          : `multiple visible widgets have the accessible name: ${target}`,
      );
    }
    return matches[0]!;
  }

  private async captureScreenshot(
    scenario: BehaviorScenario,
    name: string,
    screenshots: string[],
    deadline: number,
    signal: AbortSignal,
  ): Promise<void> {
    await this.runNative(["automate", "screenshot", defaultViewLabel, "1"], signal, remainingMs(deadline));
    const evidenceName = `${safeName(scenario.id)}-${safeName(name)}.png`;
    await copyFile(
      path.join(this.projectRoot, ".zig-cache", "native-sdk-automation", `screenshot-${defaultViewLabel}.png`),
      path.join(this.evidenceRoot, evidenceName),
    );
    screenshots.push(evidenceName);
  }

  private async inspectRuntimeLogs(logRoot: string): Promise<string[]> {
    const files: string[] = [];
    for (const entry of await readdir(logRoot, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || !entry.isFile()) {
        throw new AdapterFailure("host", "Native runtime log directory contains an invalid entry");
      }
      const file = path.join(logRoot, entry.name);
      const contents = (await readFile(file, "utf8")).slice(0, maximumOutputBytes);
      if (/(?:"(?:level|severity)"\s*:\s*"error"|panic|runtime error)/i.test(contents)) {
        throw new AdapterFailure("source", `Native runtime log reported an error in ${entry.name}`);
      }
      files.push(path.posix.join("runtime", path.basename(logRoot), entry.name));
    }
    return files.sort();
  }

  private async writeVerificationEvidence(candidate: NativeCandidate, failure?: AdapterFailure): Promise<void> {
    await mkdir(this.evidenceRoot, { recursive: true });
    await writeFile(
      path.join(this.evidenceRoot, "verification.json"),
      `${JSON.stringify({
        sourceDigest: candidate.sourceDigest,
        candidate,
        scenarioResults: [...this.scenarioResults.values()],
        screenshots: [...this.screenshots].sort(),
        runtimeLogs: [...this.runtimeLogs].sort(),
        executionDurationMs: Math.round(this.verificationElapsedMs),
        ...(failure ? { failure: { repairScope: failure.repairScope, summary: failure.message.slice(0, 500) } } : {}),
      }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }

  private async invalidateLaterEvidence(): Promise<void> {
    await rm(this.evidenceRoot, { recursive: true, force: true });
    await mkdir(this.evidenceRoot, { recursive: true });
    await rm(this.releaseRoot, { recursive: true, force: true });
    this.candidate = undefined;
    this.scenarioResults.clear();
    this.screenshots.clear();
    this.runtimeLogs.clear();
    this.verificationElapsedMs = 0;
  }

  private sanitize(value: string): string {
    return value
      .replaceAll(this.utilityRoot, "<utility>")
      .replaceAll(this.projectRoot, "<source>")
      .replaceAll(this.evidenceRoot, "<evidence>")
      .replaceAll(this.releaseRoot, "<release>")
      .replaceAll(this.nodeExecutable, "<node>")
      .replaceAll(this.nativeCliPath, "<native-cli>")
      .replaceAll(this.nativeZigPath, "<zig>")
      .replace(/sk-ant-[A-Za-z0-9_-]+/g, "<redacted-credential>");
  }
}
