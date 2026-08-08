import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
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
  sourceDigest,
  writeEditableProjectFile,
} from "./targets.js";

const maximumCommandOutputBytes = 64 * 1024;
const behaviorPassLimitMs = 45_000;
const defaultViewLabel = "main-canvas";

export type StageOutcome = {
  stage: "native_version" | "native_check" | "native_debug_automation_build";
  ok: true;
  summary: string;
  durationMs: number;
};

export type VerificationOutcome = {
  sourceDigest: string;
  scenarioResults: ScenarioResult[];
  screenshots: string[];
};

export type ReleaseOutcome = {
  artifact: ReadyArtifactMetadata;
  launchDurationMs: number;
};

export type BoundedNativeAdapterOptions = {
  nativeExecutable: string;
  projectRoot: string;
  evidenceRoot: string;
  releaseRoot: string;
};

type CommandResult = { stdout: string; stderr: string; durationMs: number };

function boundedAppend(current: string, chunk: Buffer): string {
  if (Buffer.byteLength(current) >= maximumCommandOutputBytes) return current;
  const remaining = maximumCommandOutputBytes - Buffer.byteLength(current);
  return current + chunk.subarray(0, remaining).toString("utf8");
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
  signal: AbortSignal,
  timeoutMs: number,
): Promise<CommandResult> {
  if (signal.aborted) throw abortError();
  const started = performance.now();
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
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
      const forceTimer = setTimeout(() => child.kill("SIGKILL"), 500);
      forceTimer.unref();
      finish(reason);
    };
    const onAbort = (): void => stop(abortError());
    const timer = setTimeout(
      () => stop(new Error(`command exceeded ${timeoutMs} ms`)),
      timeoutMs,
    );
    timer.unref();
    signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = boundedAppend(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = boundedAppend(stderr, chunk);
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code, processSignal) => {
      const durationMs = Math.round(performance.now() - started);
      if (code !== 0) {
        const detail = (stderr || stdout).trim().slice(0, 4096);
        finish(
          new Error(
            `command failed (${code ?? processSignal ?? "unknown"}): ${detail || "no output"}`,
          ),
        );
        return;
      }
      finish(undefined, { stdout, stderr, durationMs });
    });
  });
}

function safeName(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) throw new Error("evidence name must contain a letter or number");
  return normalized.slice(0, 80);
}

function explicitWidgetTarget(value: string): [string, string] | undefined {
  const match = /^([A-Za-z][A-Za-z0-9_-]*)#([1-9][0-9]*)$/.exec(value);
  if (!match) return undefined;
  return [match[1]!, match[2]!];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateContract(contract: BehaviorContract): void {
  if (contract.scenarios.length < 1 || contract.scenarios.length > 3) {
    throw new Error("Behavior Contract must contain one to three scenarios");
  }
  const ids = new Set<string>();
  for (const scenario of contract.scenarios) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(scenario.id) || ids.has(scenario.id)) {
      throw new Error(`invalid or duplicate Behavior Scenario id: ${scenario.id}`);
    }
    ids.add(scenario.id);
    if (scenario.steps.length < 1 || scenario.steps.length > 30) {
      throw new Error(`Behavior Scenario ${scenario.id} must contain 1 to 30 steps`);
    }
    for (const step of scenario.steps) {
      if (step.action === "wait" && (step.milliseconds < 0 || step.milliseconds > 5_000)) {
        throw new Error("Behavior Scenario waits must be between 0 and 5000 ms");
      }
      if (
        (step.action === "click" || step.action === "input") &&
        (step.target.length < 1 || step.target.length > 200 || /[\r\n"\0]/.test(step.target))
      ) {
        throw new Error("Behavior Scenario widget targets must be bounded single-line labels");
      }
      if (step.action === "input" && Buffer.byteLength(step.value) > 2_000) {
        throw new Error("Behavior Scenario input exceeds 2000 bytes");
      }
      if (step.action === "screenshot") safeName(step.name);
    }
  }
}

function remainingMs(deadline: number): number {
  const remaining = Math.floor(deadline - performance.now());
  if (remaining <= 0) throw new Error("Behavior Contract exceeded its 45-second pass limit");
  return remaining;
}

async function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    function done(): void {
      signal.removeEventListener("abort", cancelled);
      resolve();
    }
    function cancelled(): void {
      clearTimeout(timer);
      reject(abortError());
    }
    signal.addEventListener("abort", cancelled, { once: true });
  });
}

async function sha256File(file: string): Promise<string> {
  const digest = createHash("sha256");
  digest.update(await readFile(file));
  return digest.digest("hex");
}

function stopProcess(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
}

function utilityEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const name of ["HOME", "LANG", "LC_ALL", "PATH", "TMPDIR"]) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  return environment;
}

export class BoundedNativeAdapter {
  readonly nativeExecutable: string;
  readonly projectRoot: string;
  readonly evidenceRoot: string;
  readonly releaseRoot: string;
  private verificationSealed = false;

  constructor(options: BoundedNativeAdapterOptions) {
    this.nativeExecutable = path.resolve(options.nativeExecutable);
    this.projectRoot = path.resolve(options.projectRoot);
    this.evidenceRoot = path.resolve(options.evidenceRoot);
    this.releaseRoot = path.resolve(options.releaseRoot);
  }

  async writeSource(relativePath: string, contents: string): Promise<void> {
    if (this.verificationSealed) {
      throw new Error("source edits are forbidden after verification begins");
    }
    await rm(this.evidenceRoot, { recursive: true, force: true });
    await mkdir(this.evidenceRoot, { recursive: true });
    await writeEditableProjectFile(
      this.projectRoot,
      "native-bounded",
      relativePath,
      contents,
    );
  }

  async validate(signal: AbortSignal): Promise<StageOutcome[]> {
    await assertProjectPolicy(this.projectRoot, "native-bounded");
    const outcomes: StageOutcome[] = [];
    const version = await runCommand(
      this.nativeExecutable,
      ["--version"],
      this.projectRoot,
      signal,
      5_000,
    );
    const renderedVersion = version.stdout.trim();
    if (!/^native 0\.8\.1(?:\s|$)/.test(renderedVersion)) {
      throw new Error(`Native 0.8.1 is required, received: ${renderedVersion || "no version"}`);
    }
    outcomes.push({
      stage: "native_version",
      ok: true,
      summary: "Native 0.8.1",
      durationMs: version.durationMs,
    });

    const check = await runCommand(
      this.nativeExecutable,
      ["check", ".", "--strict"],
      this.projectRoot,
      signal,
      30_000,
    );
    outcomes.push({
      stage: "native_check",
      ok: true,
      summary: "Native strict source check passed",
      durationMs: check.durationMs,
    });

    const debug = await runCommand(
      this.nativeExecutable,
      ["build", ".", "--yes", "-Dautomation=true", "-Doptimize=Debug"],
      this.projectRoot,
      signal,
      180_000,
    );
    outcomes.push({
      stage: "native_debug_automation_build",
      ok: true,
      summary: "Automation-capable Debug build passed",
      durationMs: debug.durationMs,
    });
    return outcomes;
  }

  async verify(contract: BehaviorContract, signal: AbortSignal): Promise<VerificationOutcome> {
    if (this.verificationSealed) throw new Error("verification has already begun");
    validateContract(contract);
    this.verificationSealed = true;
    await assertProjectPolicy(this.projectRoot, "native-bounded");
    const verifiedDigest = await sourceDigest(this.projectRoot, "native-bounded");
    await rm(this.evidenceRoot, { recursive: true, force: true });
    await mkdir(this.evidenceRoot, { recursive: true });
    const deadline = performance.now() + behaviorPassLimitMs;
    const results: ScenarioResult[] = [];
    const screenshots: string[] = [];
    const runtimeErrors: Array<{ scenarioId: string; errors: string[] }> = [];
    const binary = path.join(this.projectRoot, "zig-out", "bin", "generated-app");

    for (const scenario of contract.scenarios) {
      const scenarioStarted = performance.now();
      let stdout = "";
      let stderr = "";
      await rm(path.join(this.projectRoot, ".zig-cache", "native-sdk-automation"), {
        recursive: true,
        force: true,
      });
      let utilitySpawnError: Error | undefined;
      const child = spawn(binary, [], {
        cwd: this.projectRoot,
        env: utilityEnvironment(),
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = boundedAppend(stdout, chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = boundedAppend(stderr, chunk);
      });
      child.once("error", (error) => {
        utilitySpawnError = error;
      });
      const onAbort = (): void => stopProcess(child);
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        await runCommand(
          this.nativeExecutable,
          ["automate", "wait"],
          this.projectRoot,
          signal,
          Math.min(remainingMs(deadline), 10_000),
        );
        for (const step of scenario.steps) {
          await this.executeStep(step, scenario, screenshots, deadline, signal);
        }
        if (!scenario.steps.some((step) => step.action === "screenshot")) {
          await this.captureScreenshot(scenario, "final", screenshots, deadline, signal);
        }
        const snapshot = await runCommand(
          this.nativeExecutable,
          ["automate", "snapshot"],
          this.projectRoot,
          signal,
          remainingMs(deadline),
        );
        const errorCount = /dispatch_errors=(\d+)/.exec(snapshot.stdout)?.[1];
        const errors = `${stdout}\n${stderr}`
          .split(/\r?\n/)
          .filter((line) => /(?:panic|runtime error|dispatch error|error:)/i.test(line))
          .map((line) => this.sanitizeEvidenceText(line))
          .slice(0, 20);
        if (errorCount !== undefined && errorCount !== "0") {
          errors.push(`Native automation reported ${errorCount} dispatch errors`);
        }
        const existingErrors = runtimeErrors.find((entry) => entry.scenarioId === scenario.id);
        if (existingErrors) existingErrors.errors.push(...errors);
        else runtimeErrors.push({ scenarioId: scenario.id, errors });
        if (errors.length > 0) throw new Error(errors[0]);
        results.push({
          scenarioId: scenario.id,
          passed: true,
          durationMs: Math.round(performance.now() - scenarioStarted),
          summary: "All host-supplied steps passed with no runtime or dispatch errors",
          screenshots: screenshots.filter((file) => file.startsWith(`${safeName(scenario.id)}-`)),
        });
      } catch (error) {
        results.push({
          scenarioId: scenario.id,
          passed: false,
          durationMs: Math.round(performance.now() - scenarioStarted),
          summary: error instanceof Error
            ? this.sanitizeEvidenceText(error.message).slice(0, 500)
            : "Behavior Scenario failed",
          screenshots: screenshots.filter((file) => file.startsWith(`${safeName(scenario.id)}-`)),
        });
        const errors = `${stdout}\n${stderr}`
          .split(/\r?\n/)
          .filter((line) => /(?:panic|runtime error|dispatch error|error:)/i.test(line))
          .map((line) => this.sanitizeEvidenceText(line))
          .slice(0, 20);
        if (utilitySpawnError) errors.unshift(this.sanitizeEvidenceText(utilitySpawnError.message).slice(0, 500));
        if (error instanceof Error) errors.unshift(this.sanitizeEvidenceText(error.message).slice(0, 500));
        const existingErrors = runtimeErrors.find((entry) => entry.scenarioId === scenario.id);
        if (existingErrors) existingErrors.errors.push(...errors);
        else runtimeErrors.push({ scenarioId: scenario.id, errors });
        await this.writeVerificationEvidence(verifiedDigest, results, screenshots, runtimeErrors, deadline);
        throw error;
      } finally {
        signal.removeEventListener("abort", onAbort);
        stopProcess(child);
      }
    }

    const outcome = { sourceDigest: verifiedDigest, scenarioResults: results, screenshots };
    await this.writeVerificationEvidence(verifiedDigest, results, screenshots, runtimeErrors, deadline);
    return outcome;
  }

  private sanitizeEvidenceText(value: string): string {
    return value
      .replaceAll(this.projectRoot, "<utility-source>")
      .replaceAll(this.evidenceRoot, "<evidence>")
      .replaceAll(this.releaseRoot, "<release>")
      .replaceAll(this.nativeExecutable, "<native-cli>")
      .replace(/sk-ant-[A-Za-z0-9_-]+/g, "<redacted-credential>");
  }

  private async writeVerificationEvidence(
    verifiedDigest: string,
    results: ScenarioResult[],
    screenshots: string[],
    runtimeErrors: Array<{ scenarioId: string; errors: string[] }>,
    deadline: number,
  ): Promise<void> {
    await writeFile(
      path.join(this.evidenceRoot, "verification.json"),
      `${JSON.stringify(
        {
          sourceDigest: verifiedDigest,
          scenarioResults: results,
          screenshots,
          totalDurationMs: Math.round(performance.now() - (deadline - behaviorPassLimitMs)),
          runtimeAndDispatchErrors: runtimeErrors,
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }

  private async executeStep(
    step: BehaviorStep,
    scenario: BehaviorScenario,
    screenshots: string[],
    deadline: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (step.action === "launch") return;
    if (step.action === "wait") {
      if (step.milliseconds > remainingMs(deadline)) {
        throw new Error("Behavior Contract exceeded its 45-second pass limit");
      }
      await delay(step.milliseconds, signal);
      return;
    }
    if (step.action === "screenshot") {
      await this.captureScreenshot(scenario, step.name, screenshots, deadline, signal);
      return;
    }

    let args: string[];
    if (step.action === "click") {
      const [view, id] = await this.resolveWidgetTarget(step.target, deadline, signal);
      args = ["automate", "widget-click", view, id];
    } else if (step.action === "input") {
      const [view, id] = await this.resolveWidgetTarget(step.target, deadline, signal);
      args = ["automate", "widget-action", view, id, "set-text", step.value];
    } else if (step.action === "assert_visible") {
      args = ["automate", "assert", "--timeout-ms", String(Math.min(5_000, remainingMs(deadline))), escapeRegex(step.target)];
    } else {
      const linePattern = `${escapeRegex(step.target)}.*${escapeRegex(step.value)}`;
      args = ["automate", "assert", "--timeout-ms", String(Math.min(5_000, remainingMs(deadline))), linePattern];
    }
    await runCommand(
      this.nativeExecutable,
      args,
      this.projectRoot,
      signal,
      remainingMs(deadline),
    );
  }

  private async resolveWidgetTarget(
    target: string,
    deadline: number,
    signal: AbortSignal,
  ): Promise<[string, string]> {
    const explicit = explicitWidgetTarget(target);
    if (explicit) return explicit;
    const snapshot = await runCommand(
      this.nativeExecutable,
      ["automate", "snapshot"],
      this.projectRoot,
      signal,
      remainingMs(deadline),
    );
    const matches: Array<[string, string]> = [];
    for (const line of snapshot.stdout.split(/\r?\n/)) {
      const match = /widget @w1\/([A-Za-z][A-Za-z0-9_-]*)#([1-9][0-9]*)\b.*\bname="([^"]*)"/.exec(line);
      if (match?.[3] === target) matches.push([match[1]!, match[2]!]);
    }
    if (matches.length !== 1) {
      throw new Error(
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
    await runCommand(
      this.nativeExecutable,
      ["automate", "screenshot", defaultViewLabel, "1"],
      this.projectRoot,
      signal,
      remainingMs(deadline),
    );
    const evidenceName = `${safeName(scenario.id)}-${safeName(name)}.png`;
    await copyFile(
      path.join(this.projectRoot, ".zig-cache", "native-sdk-automation", `screenshot-${defaultViewLabel}.png`),
      path.join(this.evidenceRoot, evidenceName),
    );
    screenshots.push(evidenceName);
  }

  async buildReleaseAndLaunch(
    verifiedDigest: string,
    signal: AbortSignal,
  ): Promise<ReleaseOutcome> {
    if (!this.verificationSealed) throw new Error("release requires sealed verification evidence");
    const currentDigest = await sourceDigest(this.projectRoot, "native-bounded");
    if (currentDigest !== verifiedDigest) {
      await rm(this.evidenceRoot, { recursive: true, force: true });
      await mkdir(this.evidenceRoot, { recursive: true });
      throw new Error("source changed after verification; evidence is invalid");
    }
    await runCommand(
      this.nativeExecutable,
      ["build", ".", "--yes", "-Doptimize=ReleaseFast"],
      this.projectRoot,
      signal,
      180_000,
    );
    const binary = path.join(this.projectRoot, "zig-out", "bin", "generated-app");
    const assets = path.join(this.projectRoot, "zig-out", "assets.bundle");
    await rm(this.releaseRoot, { recursive: true, force: true });
    await mkdir(this.releaseRoot, { recursive: true });
    const application = path.join(this.releaseRoot, "Generated App.app");
    await runCommand(
      this.nativeExecutable,
      [
        "package", "--target", "macos", "--output", application,
        "--binary", binary, "--assets", assets, "--signing", "adhoc",
      ],
      this.projectRoot,
      signal,
      60_000,
    );
    const packagedExecutables = await readdir(path.join(application, "Contents", "MacOS"));
    if (packagedExecutables.length !== 1) {
      throw new Error("standalone Utility package must contain exactly one executable");
    }
    const packagedExecutable = path.join(application, "Contents", "MacOS", packagedExecutables[0]!);
    if (!(await stat(packagedExecutable)).isFile()) {
      throw new Error("standalone Utility executable is not a regular file");
    }
    const binaryDigest = await sha256File(packagedExecutable);
    const launchStarted = performance.now();
    await runCommand("/usr/bin/open", ["-n", application], this.releaseRoot, signal, 10_000);
    await delay(1_000, signal);
    const processProbe = await runCommand(
      "/usr/bin/pgrep",
      ["-f", packagedExecutable],
      this.releaseRoot,
      signal,
      5_000,
    );
    if (!/^\d+/m.test(processProbe.stdout)) {
      throw new Error("standalone Utility did not remain running after launch");
    }
    const launchDurationMs = Math.round(performance.now() - launchStarted);
    const finalDigest = await sourceDigest(this.projectRoot, "native-bounded");
    if (finalDigest !== verifiedDigest) {
      await rm(this.evidenceRoot, { recursive: true, force: true });
      await mkdir(this.evidenceRoot, { recursive: true });
      throw new Error("source changed while preparing the release; evidence is invalid");
    }
    const artifact: ReadyArtifactMetadata = {
      path: path.relative(this.releaseRoot, application),
      sourceDigest: verifiedDigest,
      binaryDigest,
    };
    await writeFile(
      path.join(this.evidenceRoot, "release.json"),
      `${JSON.stringify({ artifact, launchDurationMs }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    return { artifact, launchDurationMs };
  }
}

export type ValidationCommand = {
  stage: "native_check" | "native_debug_automation_build";
  executable: string;
  args: string[];
  cwd: string;
};

export function nativeValidationCommands(
  nativeExecutable: string,
  projectRoot: string,
): ValidationCommand[] {
  return [
    {
      stage: "native_check",
      executable: nativeExecutable,
      args: ["check", ".", "--strict"],
      cwd: projectRoot,
    },
    {
      stage: "native_debug_automation_build",
      executable: nativeExecutable,
      args: ["build", ".", "--yes", "-Dautomation=true", "-Doptimize=Debug"],
      cwd: projectRoot,
    },
  ];
}
