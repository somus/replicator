import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { createAgenticImplementation, createReferenceReader, runStructuredAgentTurn, type AgentReference } from "./agent.js";
import {
  decodeHostCommand,
  encodeWorkerEvent,
  type AcceptedPlan,
  type AnswerClarificationCommand,
  type BehaviorContract,
  type BehaviorScenario,
  type ClarificationQuestion,
  type StartAttemptCommand,
  type WorkerEvent,
} from "./protocol.js";
import { RegistryStore, type UtilityRecord } from "./registry.js";
import { assertProjectPolicy, scaffoldUtility, sourceDigest } from "./targets.js";
import { BoundedNativeAdapter } from "./verification.js";

const ACTIVE_DEADLINE_MS = 360_000;
const FINALIZATION_RESERVE_MS = 80_000;

const configuredDataRoot = process.env.REPLICATOR_DATA_ROOT;
const configuredNativeExecutable = process.env.REPLICATOR_NATIVE_PATH;
if (!configuredDataRoot) throw new Error("REPLICATOR_DATA_ROOT is required");
if (!configuredNativeExecutable) throw new Error("REPLICATOR_NATIVE_PATH is required");
const dataRoot: string = configuredDataRoot;
const nativeExecutable: string = configuredNativeExecutable;
const registry = new RegistryStore(dataRoot);
await registry.initialize();

async function recoverInterruptedAttempt(): Promise<void> {
  const current = await registry.read();
  const utility = current.utilities.find((candidate) => candidate.activeAttempt);
  if (!utility?.activeAttempt) return;
  if (utility.activeAttempt.kind === "revision" && utility.activeAttempt.snapshot) {
    const root = path.join(dataRoot, utility.folder);
    const snapshot = path.join(root, utility.activeAttempt.snapshot);
    try {
      await lstat(snapshot);
      await rm(path.join(root, "source"), { recursive: true, force: true });
      await cp(snapshot, path.join(root, "source"), { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  utility.state = "interrupted";
  utility.lastError = {
    code: "builder_restarted",
    message: "The active Request Attempt was interrupted when Replicator stopped",
    occurredAt: nowIso(),
  };
  delete utility.activeAttempt;
  utility.updatedAt = nowIso();
  await registry.write(current);
}

await recoverInterruptedAttempt();

type PlanningResult =
  | { outcome: "clarification"; questions: ClarificationQuestion[] }
  | { outcome: "plan"; plan: AcceptedPlan };

type ActiveAttempt = {
  id: string;
  command: StartAttemptCommand;
  abortController: AbortController;
  activeStartedAt: number;
  activeElapsedMs: number;
  cancelRequested: boolean;
  waitingSince?: number;
  clarification?: {
    batchId: string;
    questions: ClarificationQuestion[];
    resolve: (answers: Record<string, string>) => void;
    reject: (error: Error) => void;
  };
};

let active: ActiveAttempt | undefined;
let shutdownRequested = false;

function emit(event: WorkerEvent): void {
  process.stdout.write(`${encodeWorkerEvent(event)}\n`);
}

function redactError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  const sensitivePaths = [process.cwd(), dataRoot, process.env.HOME]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.length - left.length);
  for (const sensitivePath of sensitivePaths) {
    if (sensitivePath) message = message.replaceAll(sensitivePath, "<redacted-path>");
  }
  return message
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "<redacted-credential>")
    .replace(/ANTHROPIC_API_KEY\s*[=:]\s*\S+/gi, "ANTHROPIC_API_KEY=<redacted>")
    .slice(0, 1000);
}

function logError(error: unknown): void {
  process.stderr.write(`${redactError(error)}\n`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function activeElapsed(attempt: ActiveAttempt): number {
  if (attempt.waitingSince !== undefined) return attempt.activeElapsedMs;
  return attempt.activeElapsedMs + (Date.now() - attempt.activeStartedAt);
}

function pauseClock(attempt: ActiveAttempt): void {
  attempt.activeElapsedMs = activeElapsed(attempt);
  attempt.waitingSince = Date.now();
}

function resumeClock(attempt: ActiveAttempt): void {
  attempt.activeStartedAt = Date.now();
  delete attempt.waitingSince;
}

function remainingActiveMs(attempt: ActiveAttempt): number {
  return Math.max(0, ACTIVE_DEADLINE_MS - activeElapsed(attempt));
}

async function withDeadline<T>(attempt: ActiveAttempt, reserveMs: number, operation: () => Promise<T>): Promise<T> {
  const remaining = remainingActiveMs(attempt) - reserveMs;
  if (remaining <= 0) throw new Error("Request Attempt deadline reached");
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          attempt.abortController.abort();
          reject(new Error("Request Attempt deadline reached"));
        }, remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const buildOutputSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["summary"],
  properties: { summary: { type: "string" } },
};

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Agent returned an invalid object");
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4000) throw new Error(`Agent returned invalid ${field}`);
  return value;
}

function validateQuestions(value: unknown): ClarificationQuestion[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 6) throw new Error("Agent returned an invalid Clarification batch");
  const ids = new Set<string>();
  return value.map((raw) => {
    const question = record(raw);
    const id = text(question.id, "Clarification id");
    if (ids.has(id)) throw new Error("Clarification question IDs must be unique");
    ids.add(id);
    if (question.answerKind !== "choice" && question.answerKind !== "short_text") throw new Error("Agent returned an invalid Clarification answer kind");
    const options = question.options;
    if (question.answerKind === "choice" && (!Array.isArray(options) || options.length < 2 || options.length > 5 || options.some((option) => typeof option !== "string"))) {
      throw new Error("Choice Clarifications require two to five options");
    }
    return {
      id,
      question: text(question.question, "Clarification question"),
      answerKind: question.answerKind,
      ...(Array.isArray(options) ? { options: options as string[] } : {}),
    };
  });
}

function validateBehaviorContract(value: unknown, kind: "build" | "revision"): BehaviorContract {
  if (!Array.isArray(value) || value.length === 0 || value.length > 3) throw new Error("Behavior Contract must contain one to three scenarios");
  const scenarios = value as BehaviorScenario[];
  const ids = new Set<string>();
  for (const scenario of scenarios) {
    if (!scenario || typeof scenario !== "object") throw new Error("Behavior Scenario must be an object");
    text(scenario.id, "Behavior Scenario id");
    text(scenario.title, "Behavior Scenario title");
    if (ids.has(scenario.id)) throw new Error("Behavior Scenario IDs must be unique");
    ids.add(scenario.id);
    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0 || scenario.steps.length > 24) throw new Error("Behavior Scenario requires bounded executable steps");
    for (const rawStep of scenario.steps) {
      const step = record(rawStep);
      if (step.action === "launch") continue;
      if (step.action === "wait") {
        if (typeof step.milliseconds !== "number" || step.milliseconds < 0 || step.milliseconds > 5_000) {
          throw new Error("Behavior Scenario waits must be between 0 and 5000 ms");
        }
        continue;
      }
      if (step.action === "screenshot") {
        text(step.name, "Behavior Scenario screenshot name");
        continue;
      }
      if (step.action === "click" || step.action === "assert_visible") {
        text(step.target, "Behavior Scenario target");
        continue;
      }
      if (step.action === "input" || step.action === "assert_text") {
        text(step.target, "Behavior Scenario target");
        text(step.value, "Behavior Scenario value");
        continue;
      }
      throw new Error("Behavior Scenario contains an unsupported step");
    }
  }
  if (!scenarios.some((scenario) => scenario.purpose === "primary")) throw new Error("Behavior Contract requires a primary scenario");
  if (kind === "revision") {
    if (!scenarios.some((scenario) => scenario.purpose === "newest_change")) throw new Error("Revision contract requires the newest change");
    if (!scenarios.some((scenario) => scenario.purpose === "preserved_behavior")) throw new Error("Revision contract requires preserved behavior");
  }
  return { scenarios };
}

function validatePlanningResult(value: unknown, kind: "build" | "revision"): PlanningResult {
  const result = record(value);
  if (result.outcome === "clarification") return { outcome: "clarification", questions: validateQuestions(result.questions) };
  if (result.outcome !== "plan" || result.format !== "native-bounded") throw new Error("Accepted Utility Format must remain bounded Native");
  return {
    outcome: "plan",
    plan: {
      summary: text(result.summary, "plan summary"),
      format: "native-bounded",
      behaviorContract: validateBehaviorContract(result.scenarios, kind),
    },
  };
}

function validateBuildResult(value: unknown): { summary: string } {
  return { summary: text(record(value).summary, "build summary") };
}

async function ensureUtility(command: StartAttemptCommand, attemptId: string): Promise<UtilityRecord> {
  let utility: UtilityRecord | undefined;
  await registry.update((current) => {
    if (current.utilities.some((candidate) => candidate.activeAttempt)) throw new Error("a Request Attempt is already active");
    utility = current.utilities.find((candidate) => candidate.id === command.utilityId);
    if (!utility) {
      if (command.kind !== "build") throw new Error("Revision requires an existing Utility");
      const timestamp = nowIso();
      utility = {
        id: command.utilityId,
        displayName: "Focus Sprint",
        format: "native-bounded",
        state: "planning",
        folder: `utilities/${command.utilityId}`,
        timeline: [],
        session: { activeId: "", replacedIds: [] },
        references: command.references,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      current.utilities.push(utility);
    }
    if (command.kind === "revision" && !utility.readyArtifact) throw new Error("Revision requires a Ready Artifact");
    if (command.kind === "revision" && (
      utility.readyArtifact?.path !== command.readyArtifact?.path ||
      utility.readyArtifact?.sourceDigest !== command.readyArtifact?.sourceDigest ||
      utility.readyArtifact?.binaryDigest !== command.readyArtifact?.binaryDigest
    )) throw new Error("Revision Ready Artifact metadata is stale");
    for (const reference of command.references) {
      if (!reference.path.startsWith(`${utility.folder}/references/`)) {
        throw new Error("Reference Images must be persisted in the Utility references folder");
      }
    }
    const timestamp = nowIso();
    if (!utility.timeline.some((entry) => entry.id === command.requestId)) {
      utility.timeline.push({
        id: command.requestId,
        kind: command.kind === "build" ? "build_request" : "revision_request",
        createdAt: timestamp,
        content: { text: command.requestText },
      });
    }
    utility.references.push(...command.references.filter((reference) => !utility!.references.some((saved) => saved.id === reference.id)));
    utility.activeAttempt = {
      id: attemptId,
      requestId: command.requestId,
      kind: command.kind,
      startedAt: timestamp,
      activeElapsedMs: 0,
      clarificationBatches: 0,
      ...(command.kind === "revision" ? { snapshot: `snapshots/${attemptId}` } : {}),
    };
    utility.state = "planning";
    delete utility.lastError;
    utility.updatedAt = timestamp;
  });
  if (!utility) throw new Error("failed to initialize Utility");
  return utility;
}

async function prepareSource(command: StartAttemptCommand, attemptId: string, utility: UtilityRecord): Promise<void> {
  const root = path.join(dataRoot, utility.folder);
  const source = path.join(root, "source");
  await mkdir(root, { recursive: true });
  if (command.kind === "build") {
    try {
      await lstat(source);
      await assertProjectPolicy(source, "native-bounded");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await scaffoldUtility(source, "native-bounded");
    }
  } else {
    const currentDigest = await sourceDigest(source, "native-bounded");
    if (currentDigest !== command.currentSourceDigest || currentDigest !== utility.readyArtifact?.sourceDigest) {
      throw new Error("Revision source digest does not match the Ready Artifact");
    }
    await cp(source, path.join(root, "snapshots", attemptId), { recursive: true, errorOnExist: true });
  }
}

async function setState(utilityId: string, attemptId: string, state: UtilityRecord["state"]): Promise<void> {
  await registry.update((current) => {
    const utility = current.utilities.find((candidate) => candidate.id === utilityId);
    if (!utility || utility.activeAttempt?.id !== attemptId) throw new Error("Request Attempt is no longer active");
    utility.state = state;
    utility.updatedAt = nowIso();
  });
  emit({ type: "state_changed", attemptId, state });
}

async function waitForClarification(attempt: ActiveAttempt, utility: UtilityRecord, questions: ClarificationQuestion[], batchNumber: number): Promise<Record<string, string>> {
  if (batchNumber > 2) throw new Error("Clarification limit exceeded");
  const batchId = `batch_${batchNumber}`;
  pauseClock(attempt);
  await registry.update((current) => {
    const stored = current.utilities.find((candidate) => candidate.id === utility.id);
    if (!stored || !stored.activeAttempt) throw new Error("Request Attempt is no longer active");
    stored.state = "awaiting_clarification";
    stored.activeAttempt.clarificationBatches = batchNumber;
    stored.activeAttempt.activeElapsedMs = activeElapsed(attempt);
    stored.timeline.push({ id: batchId, kind: "clarification", createdAt: nowIso(), content: { batchId, questions } });
    stored.updatedAt = nowIso();
  });
  emit({ type: "state_changed", attemptId: attempt.id, state: "awaiting_clarification" });
  emit({ type: "clarification_required", attemptId: attempt.id, batchId, questions });
  return await new Promise<Record<string, string>>((resolve, reject) => {
    attempt.clarification = { batchId, questions, resolve, reject };
  });
}

async function saveClarification(utilityId: string, batchId: string, answers: Record<string, string>): Promise<void> {
  await registry.update((current) => {
    const utility = current.utilities.find((candidate) => candidate.id === utilityId);
    const entry = utility?.timeline.find((candidate) => candidate.id === batchId);
    if (!utility || !entry) throw new Error("Clarification batch is unavailable");
    entry.content.answers = answers;
    utility.updatedAt = nowIso();
  });
}

function agentReferences(command: StartAttemptCommand): AgentReference[] {
  return command.references.map((reference) => ({
    id: reference.id,
    mediaType: reference.mediaType,
    load: async () => {
      const absolutePath = path.resolve(dataRoot, reference.path);
      if (!absolutePath.startsWith(`${path.resolve(dataRoot)}${path.sep}`)) throw new Error("Reference Image path escapes the data root");
      const data = await readFile(absolutePath);
      const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
      const webp = data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
      if ((reference.mediaType === "image/png" && !png) || (reference.mediaType === "image/jpeg" && !jpeg) || (reference.mediaType === "image/webp" && !webp)) {
        throw new Error("Reference Image contents do not match the declared media type");
      }
      return data;
    },
  }));
}

async function sourceContext(sourceRoot: string): Promise<string> {
  const parts: string[] = [];
  for (const file of ["app.zon", "src/app.native", "src/core.ts"]) {
    const contents = await readFile(path.join(sourceRoot, file), "utf8");
    parts.push(`--- ${file} ---\n${contents}`);
  }
  return parts.join("\n");
}

async function persistPlan(utilityId: string, attemptId: string, plan: AcceptedPlan): Promise<void> {
  await registry.update((current) => {
    const utility = current.utilities.find((candidate) => candidate.id === utilityId);
    if (!utility || utility.activeAttempt?.id !== attemptId) throw new Error("Request Attempt is no longer active");
    utility.format = plan.format;
    utility.acceptedPlan = plan;
    utility.behaviorContract = plan.behaviorContract;
    utility.updatedAt = nowIso();
  });
  emit({ type: "plan_accepted", attemptId, plan });
}

async function finishFailure(attempt: ActiveAttempt, utility: UtilityRecord, error: unknown): Promise<void> {
  const interrupted = attempt.cancelRequested;
  let rollback = "Partial source retained for retry";
  if (attempt.command.kind === "revision") {
    const root = path.join(dataRoot, utility.folder);
    const source = path.join(root, "source");
    const snapshot = path.join(root, "snapshots", attempt.id);
    try {
      await lstat(snapshot);
      await rm(source, { recursive: true, force: true });
      await cp(snapshot, source, { recursive: true });
      rollback = "Previous Ready Artifact and source restored";
    } catch (snapshotError) {
      if ((snapshotError as NodeJS.ErrnoException).code !== "ENOENT") throw snapshotError;
      rollback = "Previous Ready Artifact and source remained unchanged";
    }
  }
  const reason = interrupted ? "Request Attempt cancelled" : "Request Attempt could not complete";
  await registry.update((current) => {
    const stored = current.utilities.find((candidate) => candidate.id === utility.id);
    if (!stored) return;
    stored.state = interrupted ? "interrupted" : "failed";
    delete stored.activeAttempt;
    stored.lastError = { code: interrupted ? "cancelled" : "attempt_failed", message: reason, occurredAt: nowIso() };
    stored.updatedAt = nowIso();
  });
  if (interrupted) emit({ type: "attempt_interrupted", attemptId: attempt.id, reason, rollback });
  else emit({ type: "attempt_failed", attemptId: attempt.id, reason, rollback });
  if (!interrupted) logError(error);
}

async function runAttempt(attempt: ActiveAttempt): Promise<void> {
  let utility: UtilityRecord | undefined;
  try {
    utility = await ensureUtility(attempt.command, attempt.id);
    await prepareSource(attempt.command, attempt.id, utility);
    emit({ type: "state_changed", attemptId: attempt.id, state: "planning" });

    const sourceRoot = path.join(dataRoot, utility.folder, "source");
    const utilityRoot = path.join(dataRoot, utility.folder);
    const evidenceRoot = path.join(utilityRoot, "evidence", attempt.id);
    const releaseRoot = path.join(utilityRoot, "artifacts", attempt.id);
    const sessionConfigDir = path.join(utilityRoot, "agent-session");
    await mkdir(sessionConfigDir, { recursive: true, mode: 0o700 });
    const references = agentReferences(attempt.command);
    let plan: AcceptedPlan | undefined;
    let clarificationBatch = 0;
    let candidateVerificationNumber = 0;
    const candidateAdapter = (candidateEvidenceRoot = path.join(utilityRoot, "evidence", `${attempt.id}-agent`)) => new BoundedNativeAdapter({
      nativeExecutable,
      projectRoot: sourceRoot,
      evidenceRoot: candidateEvidenceRoot,
      releaseRoot: path.join(utilityRoot, "artifacts", `${attempt.id}-agent`),
    });
    const implementation = createAgenticImplementation({
      acceptPlan: async (input) => {
        const result = validatePlanningResult({
          outcome: "plan",
          format: "native-bounded",
          summary: input.summary,
          scenarios: input.scenarios,
        }, attempt.command.kind);
        if (result.outcome !== "plan") throw new Error("Plan submission is invalid");
        plan = result.plan;
        await persistPlan(utility!.id, attempt.id, result.plan);
        await setState(utility!.id, attempt.id, "building");
        return `Plan accepted with ${result.plan.behaviorContract.scenarios.length} immutable Behavior Scenarios. Implement it now.`;
      },
      requestClarification: async (rawQuestions) => {
        if (clarificationBatch >= 2) throw new Error("Clarification limit exceeded");
        clarificationBatch += 1;
        const questions = validateQuestions(rawQuestions);
        const answers = await waitForClarification(attempt, utility!, questions, clarificationBatch);
        await saveClarification(utility!.id, `batch_${clarificationBatch}`, answers);
        delete attempt.clarification;
        resumeClock(attempt);
        await setState(utility!.id, attempt.id, "planning");
        return answers;
      },
      writeSource: (file, contents) => candidateAdapter().writeSource(file, contents),
      currentDigest: () => sourceDigest(sourceRoot, "native-bounded"),
      validate: async () => {
        const outcomes = await candidateAdapter().validate(attempt.abortController.signal);
        return outcomes.map((outcome) => `${outcome.summary} (${outcome.durationMs} ms)`).join("\n");
      },
      verify: async () => {
        if (!plan) throw new Error("Behavior Contract is unavailable before plan acceptance");
        candidateVerificationNumber += 1;
        const candidateEvidence = path.join(utilityRoot, "evidence", `${attempt.id}-agent-${candidateVerificationNumber}`);
        const outcome = await candidateAdapter(candidateEvidence).verify(plan.behaviorContract, attempt.abortController.signal);
        return `${outcome.scenarioResults.length} accepted Behavior Scenarios passed with ${outcome.screenshots.length} screenshots`;
      },
      onStage: (stage, ok, summary) => emit({
        type: "stage_result",
        attemptId: attempt.id,
        stage,
        ok,
        summary: redactError(summary),
      }),
    });
    const buildPrompt = [
      "Plan and implement one bounded Native macOS Utility in this single live agent query. Inspect every supplied Reference Image before accepting the plan. If a material ambiguity prevents a safe plan, call request_clarification and use the returned owner answers. Otherwise call accept_plan once before editing.",
      `Request kind: ${attempt.command.kind}.`,
      `Owner request: ${attempt.command.requestText}`,
      `Reference Image IDs: ${references.map((reference) => reference.id).join(", ") || "none"}.`,
      utility!.behaviorContract ? `Existing Behavior Contract to preserve where applicable: ${JSON.stringify(utility!.behaviorContract)}` : "",
      "The accepted format is native-bounded. Submit one to three host-executable scenarios using launch, click, input, wait, assert_text, assert_visible, and screenshot with stable accessibility targets. Include primary behavior; a Revision must also cover newest_change and preserved_behavior. Each wait is at most 5000 ms. The 10-second Demo preset is accelerated Focus completion and increments the completed-focus count.",
      "Keep app.zon name generated-app. Do not use dependencies, scripts, nested modules, or unrequested features.",
      "After editing, call validate_app and repair its exact diagnostics in this same turn. Then call verify_behavior for the immutable host contract; if behavior fails, make a focused repair, validate again, and retry. Call finalize_app exactly once as your final tool action, then return the structured summary. Do not claim completion without finalization.",
      await sourceContext(sourceRoot),
    ].join("\n");
    await withDeadline(
      attempt,
      FINALIZATION_RESERVE_MS,
      () => runStructuredAgentTurn({
        cwd: sourceRoot,
        sessionConfigDir,
        prompt: buildPrompt,
        ...(utility!.session.activeId ? { resumeSessionId: utility!.session.activeId } : {}),
        abortController: attempt.abortController,
        outputSchema: buildOutputSchema,
        validateOutput: validateBuildResult,
        mcpServers: {
          replicator: implementation.server,
          ...(references.length > 0 ? { references: createReferenceReader(references) } : {}),
        },
        allowedTools: [
          "mcp__replicator__write_source",
          "mcp__replicator__request_clarification",
          "mcp__replicator__accept_plan",
          "mcp__replicator__read_sdk_doc",
          "mcp__replicator__validate_app",
          "mcp__replicator__verify_behavior",
          "mcp__replicator__finalize_app",
          ...(references.length > 0 ? ["mcp__references__read_reference_image"] : []),
        ],
        maxTurns: 40,
        onInitialized: async (initializedId) => {
          await registry.persistSession(utility!.id, initializedId);
          emit({ type: "session_initialized", utilityId: utility!.id, sessionId: initializedId });
        },
      }),
    );
    const acceptedPlan = plan;
    if (!acceptedPlan) throw new Error("Agent implementation ended without an accepted plan");
    const agentFinalizedDigest = implementation.finalizedDigest();
    if (!agentFinalizedDigest || agentFinalizedDigest !== await sourceDigest(sourceRoot, "native-bounded")) {
      throw new Error("Agent implementation ended without finalizing the current source digest");
    }

    const adapter = new BoundedNativeAdapter({ nativeExecutable, projectRoot: sourceRoot, evidenceRoot, releaseRoot });
    const validationOutcomes = await withDeadline(attempt, FINALIZATION_RESERVE_MS, () => adapter.validate(attempt.abortController.signal));
    for (const outcome of validationOutcomes) emit({
      type: "stage_result",
      attemptId: attempt.id,
      stage: "validation",
      ok: outcome.ok,
      summary: `Final host check: ${outcome.summary}`,
      durationMs: outcome.durationMs,
    });
    await setState(utility.id, attempt.id, "verifying");
    const verification = await withDeadline(attempt, 0, () => adapter.verify(acceptedPlan.behaviorContract, attempt.abortController.signal));
    emit({
      type: "stage_result",
      attemptId: attempt.id,
      stage: "verification",
      ok: true,
      summary: `${verification.scenarioResults.length} Behavior Scenarios passed for the verified source digest`,
    });
    await setState(utility.id, attempt.id, "preparing");
    const release = await withDeadline(attempt, 0, () => adapter.buildReleaseAndLaunch(verification.sourceDigest, attempt.abortController.signal));
    const artifactPath = path.relative(dataRoot, path.join(releaseRoot, release.artifact.path));
    const screenshots = verification.screenshots.map((screenshot) => path.relative(dataRoot, path.join(evidenceRoot, screenshot)));
    const scenarioResults = verification.scenarioResults.map((result) => ({
      ...result,
      screenshots: result.screenshots.map((screenshot) => path.relative(dataRoot, path.join(evidenceRoot, screenshot))),
    }));
    const artifact = { ...release.artifact, path: artifactPath };
    emit({
      type: "stage_result",
      attemptId: attempt.id,
      stage: "packaging",
      ok: true,
      summary: "ReleaseFast standalone Utility package created",
    });
    emit({
      type: "stage_result",
      attemptId: attempt.id,
      stage: "launch",
      ok: true,
      summary: "Standalone Utility launched successfully",
      durationMs: release.launchDurationMs,
    });
    await registry.update((current) => {
      const stored = current.utilities.find((candidate) => candidate.id === utility!.id);
      if (!stored || stored.activeAttempt?.id !== attempt.id) throw new Error("Request Attempt is no longer active");
      stored.state = "ready";
      stored.readyArtifact = {
        ...artifact,
        evidencePath: path.relative(dataRoot, evidenceRoot),
        screenshots,
        scenarioResults,
        createdAt: nowIso(),
      };
      delete stored.activeAttempt;
      delete stored.lastError;
      stored.updatedAt = nowIso();
    });
    if (attempt.command.kind === "revision") {
      await rm(path.join(utilityRoot, "snapshots", attempt.id), { recursive: true, force: true });
    }
    emit({ type: "artifact_ready", attemptId: attempt.id, artifact, screenshots, scenarioResults });
    emit({ type: "state_changed", attemptId: attempt.id, state: "ready" });
  } catch (error) {
    if (utility) await finishFailure(attempt, utility, error);
    else logError(error);
  } finally {
    active = undefined;
    if (shutdownRequested) setImmediate(() => process.exit(0));
  }
}

async function answerClarification(command: AnswerClarificationCommand): Promise<void> {
  if (!active || active.id !== command.attemptId || !active.clarification) throw new Error("Clarification is not awaiting answers");
  if (active.clarification.batchId !== command.batchId) throw new Error("Clarification batch does not match");
  if (Object.keys(command.answers).length !== active.clarification.questions.length) throw new Error("Every Clarification question requires one answer");
  for (const question of active.clarification.questions) {
    const answer = command.answers[question.id];
    if (!answer) throw new Error(`Clarification answer is missing: ${question.id}`);
    if (question.answerKind === "choice" && !question.options?.includes(answer)) throw new Error(`Clarification answer is not an offered option: ${question.id}`);
  }
  active.clarification.resolve(command.answers);
}

async function cancelAttempt(attemptId: string): Promise<void> {
  if (!active || active.id !== attemptId) throw new Error("Request Attempt is not active");
  active.cancelRequested = true;
  active.abortController.abort();
  active.clarification?.reject(new Error("Request Attempt cancelled"));
  await new Promise((resolve) => setTimeout(resolve, 3_000));
}

function handleTerminationSignal(): void {
  if (shutdownRequested) return;
  shutdownRequested = true;
  if (!active) {
    process.exit(0);
    return;
  }
  active.cancelRequested = true;
  active.abortController.abort();
  active.clarification?.reject(new Error("Request Attempt cancelled"));
  setTimeout(() => process.exit(143), 3_000);
}

process.on("SIGTERM", handleTerminationSignal);
process.on("SIGINT", handleTerminationSignal);

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (line.trim().length === 0) continue;
  try {
    const command = decodeHostCommand(line);
    if (command.type === "start_attempt") {
      if (active) throw new Error("a Request Attempt is already active");
      const attempt: ActiveAttempt = {
        id: randomUUID(),
        command,
        abortController: new AbortController(),
        activeStartedAt: Date.now(),
        activeElapsedMs: 0,
        cancelRequested: false,
      };
      active = attempt;
      void runAttempt(attempt);
    } else if (command.type === "answer_clarification") {
      await answerClarification(command);
    } else {
      await cancelAttempt(command.attemptId);
    }
  } catch (error) {
    logError(error);
  }
}
