import { createInterface } from "node:readline";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, copyFile, cp, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createAgenticImplementation,
  createCodingGuidance,
  createPlanningGuidance,
  createReferenceReader,
  routeModel,
  runStructuredAgentTurn,
  systemInstruction,
  type AgentReference,
} from "./agent.js";
import { NativeGuidance } from "./native-guidance.js";
import {
  decodeHostCommand,
  encodeWorkerEvent,
  type AcceptedPlan,
  type AnswerClarificationCommand,
  type BehaviorContract,
  type BehaviorScenario,
  type ClarificationQuestion,
  type LoadRegistryCommand,
  type NativeGuidanceSelection,
  type StartAttemptCommand,
  type WorkerEvent,
} from "./protocol.js";
import { RegistryStore, type OwnerTimelineEntry, type UtilityRecord } from "./registry.js";
import { assertProjectPolicy, sourceDigest } from "./targets.js";
import {
  AdapterFailure,
  BoundedNativeAdapter,
  type FinalizationOutcome,
  type VerificationOutcome,
} from "./verification.js";

const ACTIVE_DEADLINE_MS = 360_000;
const FINALIZATION_RESERVE_MS = 80_000;

const configuredDataRoot = process.env.REPLICATOR_DATA_ROOT;
if (!configuredDataRoot) throw new Error("REPLICATOR_DATA_ROOT is required");
const dataRoot: string = configuredDataRoot;
const registry = new RegistryStore(dataRoot);
await registry.initialize();

async function recoverInterruptedAttempt(): Promise<void> {
  const current = await registry.read();
  const utility = current.utilities.find((candidate) => candidate.activeAttempt);
  if (!utility?.activeAttempt) return;
  if (utility.state === "awaiting_clarification" && utility.activeAttempt.pendingClarification) return;
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

class ClarificationPause extends Error {
  constructor() {
    super("Request Attempt is awaiting Clarification");
    this.name = "ClarificationPause";
  }
}

let active: ActiveAttempt | undefined;
let shutdownRequested = false;

function emit(event: WorkerEvent): void {
  const line = encodeWorkerEvent(event);
  if (Buffer.byteLength(line) >= 3 * 1024) throw new Error(`worker event exceeds 3 KiB: ${event.type}`);
  process.stdout.write(`${line}\n`);
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

function assertResolvedModel(resolvedModel: string, logicalModel: "haiku" | "sonnet"): void {
  if (!resolvedModel.toLowerCase().includes(logicalModel)) {
    throw new Error(`Agent SDK resolved an unexpected model for the locked ${logicalModel} route`);
  }
}

function imageMetadata(data: Buffer): { mediaType: "image/png" | "image/jpeg" | "image/webp"; extension: string; width: number; height: number } {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && data.length >= 24) {
    return { mediaType: "image/png", extension: "png", width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (data[0] === 0xff && data[1] === 0xd8) {
    let at = 2;
    while (at + 9 < data.length) {
      if (data[at] !== 0xff) { at += 1; continue; }
      const marker = data[at + 1]!;
      if (marker === 0xd9 || marker === 0xda) break;
      const length = data.readUInt16BE(at + 2);
      if (length < 2 || at + 2 + length > data.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { mediaType: "image/jpeg", extension: "jpg", height: data.readUInt16BE(at + 5), width: data.readUInt16BE(at + 7) };
      }
      at += 2 + length;
    }
  }
  if (data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") {
    const chunk = data.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X" && data.length >= 30) {
      return { mediaType: "image/webp", extension: "webp", width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
    }
    if (chunk === "VP8L" && data.length >= 25 && data[20] === 0x2f) {
      return { mediaType: "image/webp", extension: "webp", width: 1 + data[21]! + ((data[22]! & 0x3f) << 8), height: 1 + ((data[22]! & 0xc0) >> 6) + (data[23]! << 2) + ((data[24]! & 0x0f) << 10) };
    }
    if (chunk === "VP8 " && data.length >= 30 && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) {
      return { mediaType: "image/webp", extension: "webp", width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
    }
  }
  throw new Error("Reference Image must be a valid PNG, JPEG, or WebP file");
}

async function runSips(source: string, destination: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("/usr/bin/sips", ["--resampleHeightWidthMax", "2000", source, "--out", destination], { stdio: ["ignore", "ignore", "pipe"] });
    let errorText = "";
    child.stderr.on("data", (chunk: Buffer) => { errorText = `${errorText}${chunk.toString("utf8")}`.slice(0, 2_000); });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`Reference Image normalization failed: ${errorText}`)));
  });
}

async function normalizeStartReferences(command: StartAttemptCommand): Promise<StartAttemptCommand> {
  const selectedPaths = command.referencePaths ?? [];
  if (command.references.length + selectedPaths.length > 4) throw new Error("a Request Attempt accepts at most four Reference Images");
  if (selectedPaths.length === 0) return command;
  const references = [...command.references];
  const destinationRoot = path.join(dataRoot, "utilities", command.utilityId, "references");
  await mkdir(destinationRoot, { recursive: true, mode: 0o700 });
  for (const selectedPath of selectedPaths) {
    const entry = await lstat(selectedPath);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.size < 12 || entry.size > 5 * 1024 * 1024) throw new Error("Reference Image is not a bounded regular file");
    const source = await readFile(selectedPath);
    const metadata = imageMetadata(source);
    if (metadata.width < 1 || metadata.height < 1) throw new Error("Reference Image dimensions are invalid");
    const id = `reference_${randomUUID()}`;
    const destination = path.join(destinationRoot, `${id}.${metadata.extension}`);
    if (Math.max(metadata.width, metadata.height) > 2_000) await runSips(selectedPath, destination);
    else await copyFile(selectedPath, destination);
    await chmod(destination, 0o600);
    const normalized = await readFile(destination);
    const normalizedMetadata = imageMetadata(normalized);
    if (normalized.length > 5 * 1024 * 1024 || Math.max(normalizedMetadata.width, normalizedMetadata.height) > 2_000) throw new Error("Reference Image normalization exceeded its bounds");
    references.push({
      id,
      path: path.relative(dataRoot, destination),
      mediaType: normalizedMetadata.mediaType,
      byteLength: normalized.length,
      width: normalizedMetadata.width,
      height: normalizedMetadata.height,
    });
  }
  const { referencePaths: _discarded, ...persistable } = command;
  return { ...persistable, references };
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

const planningOutputSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["outcome"],
  properties: {
    outcome: { enum: ["clarification", "plan"] },
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "question", "answerKind"],
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          answerKind: { enum: ["choice", "short_text"] },
          options: { type: "array", minItems: 2, maxItems: 2, items: { type: "string" } },
        },
      },
    },
    summary: { type: "string" },
    format: { const: "native-bounded" },
    formatReason: { type: "string" },
    primaryWorkflow: { type: "string" },
    requirements: {
      type: "array",
      minItems: 1,
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceQuote", "acceptance"],
        properties: { sourceQuote: { type: "string" }, acceptance: { type: "string" } },
      },
    },
    decisions: { type: "array", maxItems: 16, items: { type: "string" } },
    nativeGuidance: {
      type: "array",
      minItems: 1,
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["corpus", "id", "sectionIds", "digest", "purpose"],
        properties: {
          corpus: { enum: ["skill", "official"] },
          id: { type: "string" },
          sectionIds: { type: "array", minItems: 1, maxItems: 16, items: { type: "string" } },
          digest: { type: "string" },
          purpose: { type: "string" },
          component: {
            type: "object",
            additionalProperties: false,
            required: ["element", "bindings", "events"],
            properties: {
              element: { type: "string" },
              bindings: { type: "array", maxItems: 16, items: { type: "string" } },
              events: { type: "array", maxItems: 16, items: { type: "string" } },
            },
          },
        },
      },
    },
    scenarios: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "purpose", "steps"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          purpose: { enum: ["primary", "newest_change", "preserved_behavior", "high_risk"] },
          steps: {
            type: "array",
            minItems: 1,
            maxItems: 24,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["action"],
              properties: {
                action: { enum: ["launch", "click", "input", "assert_text", "assert_visible", "screenshot"] },
                target: { type: "string" },
                value: { type: "string" },
                milliseconds: { type: "number", minimum: 0, maximum: 5_000 },
                name: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
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
  return value.map((raw, index) => {
    const question = record(raw);
    const id = text(question.id, "Clarification id");
    if (ids.has(id)) throw new Error("Clarification question IDs must be unique");
    ids.add(id);
    if (question.answerKind !== "choice" && question.answerKind !== "short_text") throw new Error("Agent returned an invalid Clarification answer kind");
    const options = question.options;
    if (question.answerKind === "choice" && (index !== 0 || !Array.isArray(options) || options.length !== 2 || options.some((option) => typeof option !== "string"))) {
      throw new Error("A Clarification batch may begin with one choice containing exactly two options");
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
      if (step.action === "wait") throw new Error("Behavior Scenario fixed waits are not executable; use an assertion");
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

function validateNativeGuidance(value: unknown): NativeGuidanceSelection[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) throw new Error("Accepted plan requires bounded Native guidance");
  let skillSections = 0;
  let officialPages = 0;
  const selections: NativeGuidanceSelection[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const item = record(raw);
    if (!Array.isArray(item.sectionIds) || item.sectionIds.length === 0 || item.sectionIds.length > 16) throw new Error("Native guidance requires bounded section IDs");
    const sectionIds = item.sectionIds.map((section) => text(section, "guidance section"));
    const common = {
      sectionIds,
      digest: text(item.digest, "guidance digest"),
      purpose: text(item.purpose, "guidance purpose"),
    };
    if (!/^[a-f0-9]{64}$/.test(common.digest)) throw new Error("Native guidance digest is invalid");
    if (item.corpus === "skill") {
      const id = text(item.id, "skill ID");
      if (!["native-ui", "ts-core", "automation", "core", "zig"].includes(id)) throw new Error("Native skill ID is invalid");
      skillSections += sectionIds.length;
      selections.push({ corpus: "skill", id: id as Extract<NativeGuidanceSelection, { corpus: "skill" }>["id"], ...common });
    } else {
      if (item.corpus !== "official") throw new Error("Native guidance corpus is invalid");
      const id = text(item.id, "official page ID");
      if (!/^docs\/[A-Za-z0-9_./-]+\.md$/.test(id) || id.includes("..")) throw new Error("Official Native page ID is invalid");
      officialPages += 1;
      let component: Extract<NativeGuidanceSelection, { corpus: "official" }>["component"];
      if (item.component !== undefined) {
        const rawComponent = record(item.component);
        const strings = (input: unknown, label: string): string[] => {
          if (!Array.isArray(input) || input.length > 16) throw new Error(`${label} is invalid`);
          return input.map((entry) => text(entry, label));
        };
        component = {
          element: text(rawComponent.element, "component element"),
          bindings: strings(rawComponent.bindings, "component binding"),
          events: strings(rawComponent.events, "component event"),
        };
      }
      selections.push({ corpus: "official", id: id as `docs/${string}.md`, ...common, ...(component ? { component } : {}) });
    }
    const selection = selections.at(-1)!;
    const key = `${selection.corpus}:${selection.id}`;
    if (seen.has(key)) throw new Error("Native guidance selection contains a duplicate ID");
    seen.add(key);
  }
  if (skillSections > 8 || officialPages > 16) throw new Error("Native guidance selection exceeds the accepted-plan cap");
  return selections;
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
      formatReason: text(result.formatReason, "format reason"),
      primaryWorkflow: text(result.primaryWorkflow, "primary workflow"),
      requirements: (() => {
        if (!Array.isArray(result.requirements) || result.requirements.length === 0 || result.requirements.length > 16) throw new Error("Plan requirements are invalid");
        return result.requirements.map((raw) => {
          const requirement = record(raw);
          return { sourceQuote: text(requirement.sourceQuote, "requirement source"), acceptance: text(requirement.acceptance, "requirement acceptance") };
        });
      })(),
      decisions: (() => {
        if (!Array.isArray(result.decisions) || result.decisions.length > 16) throw new Error("Plan decisions are invalid");
        return result.decisions.map((decision) => text(decision, "plan decision"));
      })(),
      nativeGuidance: validateNativeGuidance(result.nativeGuidance),
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
      command,
      ...(command.kind === "revision" ? { snapshot: `snapshots/${attemptId}` } : {}),
    };
    utility.state = "planning";
    delete utility.lastError;
    utility.updatedAt = timestamp;
  });
  if (!utility) throw new Error("failed to initialize Utility");
  return utility;
}

async function prepareSource(
  command: StartAttemptCommand,
  attemptId: string,
  utility: UtilityRecord,
  adapter: BoundedNativeAdapter,
  signal: AbortSignal,
): Promise<void> {
  const root = path.join(dataRoot, utility.folder);
  const source = path.join(root, "source");
  await mkdir(root, { recursive: true });
  if (command.kind === "build") {
    try {
      await lstat(source);
      await assertProjectPolicy(source, "native-bounded");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await adapter.scaffold(signal);
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
    stored.activeAttempt.pendingClarification = { batchId, questions };
    stored.timeline.push({ id: batchId, kind: "clarification", createdAt: nowIso(), content: { batchId, questions } });
    stored.updatedAt = nowIso();
  });
  emit({ type: "state_changed", attemptId: attempt.id, state: "awaiting_clarification" });
  emit({ type: "clarification_required", attemptId: attempt.id, batchId, questions });
  if (process.argv[2] !== undefined) throw new ClarificationPause();
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

function planningPrompt(command: StartAttemptCommand, previousContract: BehaviorContract | undefined, guidanceCatalog: string, answers?: Record<string, string>): string {
  return [
    `Request kind: ${command.kind}.`,
    `Owner request: ${command.requestText}`,
    `Reference Image IDs: ${command.references.map((reference) => reference.id).join(", ") || "none"}. Inspect every supplied image.`,
    previousContract ? `Existing Behavior Contract to preserve where applicable: ${JSON.stringify(previousContract)}` : "",
    answers ? `Recorded owner Clarification answers: ${JSON.stringify(answers)}` : "",
    `Packaged Native guidance catalog: ${guidanceCatalog}`,
    "Return one material Clarification batch only when ambiguity would change the result. A batch may begin with one choice question containing exactly two options; every additional question must use short_text. Otherwise return one complete native-bounded plan with requirements, decisions, the smallest exact nativeGuidance selection, and one to three executable scenarios.",
    "The nativeGuidance selection must include both native-ui and ts-core and use at most eight skill sections total across both entries; count them before returning. Do not select generic native-ui elements or attributes sections when exact component pages cover them. Include the exact official docs/components page for every selected UI component, with component metadata naming its element and the exact bindings and events the plan will use.",
    "Use only launch, click, input, assert_text, assert_visible, and screenshot. Fixed waits are not executable; assertions own bounded polling. A Revision includes primary, newest_change, and preserved_behavior. Demo is accelerated Focus completion and increments the completed count.",
  ].filter(Boolean).join("\n");
}

async function acceptPlan(
  attempt: ActiveAttempt,
  utility: UtilityRecord,
  sourceRoot: string,
  sessionConfigDir: string,
  guidance: NativeGuidance,
): Promise<{ plan: AcceptedPlan; sessionId: string }> {
  let sessionId = utility.session.activeId || undefined;
  const lastAnsweredClarification = [...utility.timeline].reverse().find((entry) => entry.kind === "clarification" && entry.content.answers);
  let answers = lastAnsweredClarification?.content.answers;
  let batchNumber = utility.activeAttempt?.clarificationBatches ?? 0;
  const references = agentReferences(attempt.command);
  const route = routeModel("planning", utility.format, attempt.command.modelOverride, attempt.command.effortOverride);
  const instruction = systemInstruction("planning", utility.format);
  for (;;) {
    const turn = await withDeadline(attempt, FINALIZATION_RESERVE_MS, () => runStructuredAgentTurn({
      cwd: sourceRoot,
      sessionConfigDir,
      prompt: planningPrompt(attempt.command, utility.behaviorContract, guidance.compactCatalog(), answers),
      ...(sessionId ? { resumeSessionId: sessionId } : {}),
      abortController: attempt.abortController,
      outputSchema: planningOutputSchema,
      validateOutput: (value) => validatePlanningResult(value, attempt.command.kind),
      model: route.model,
      effort: route.effort,
      systemInstruction: instruction.text,
      mcpServers: {
        guidance: createPlanningGuidance(guidance),
        ...(references.length > 0 ? { references: createReferenceReader(references) } : {}),
      },
      allowedTools: [
        "mcp__guidance__list_native_guides",
        "mcp__guidance__search_native_guides",
        "mcp__guidance__read_native_guide",
        "mcp__guidance__list_native_docs",
        "mcp__guidance__search_native_docs",
        "mcp__guidance__read_native_doc",
        ...(references.length > 0 ? ["mcp__references__read_reference_image"] : []),
      ],
      onInitialized: async (initialized) => {
        sessionId = initialized.sessionId;
        await registry.persistSession(utility.id, initialized.sessionId);
        assertResolvedModel(initialized.resolvedModel, route.model);
        await registry.persistQuery(utility.id, attempt.id, {
          phase: "planning",
          instructionVersion: instruction.version,
          instructionDigest: instruction.digest,
          logicalModel: route.model,
          effort: route.effort,
          resolvedModel: initialized.resolvedModel,
          routeReason: route.reason,
        });
        emit({ type: "session_initialized", utilityId: utility.id, sessionId: initialized.sessionId });
      },
    }));
    sessionId = turn.sessionId;
    if (turn.output.outcome === "plan") {
      guidance.assertSelections(turn.output.plan.nativeGuidance, turn.output.plan.format);
      return { plan: turn.output.plan, sessionId };
    }
    batchNumber += 1;
    answers = await waitForClarification(attempt, utility, turn.output.questions, batchNumber);
    await saveClarification(utility.id, `batch_${batchNumber}`, answers);
    delete attempt.clarification;
    resumeClock(attempt);
    await setState(utility.id, attempt.id, "planning");
  }
  throw new Error("Clarification limit exceeded");
}

async function persistPlan(utilityId: string, attemptId: string, plan: AcceptedPlan): Promise<void> {
  const createdAt = nowIso();
  await registry.update((current) => {
    const utility = current.utilities.find((candidate) => candidate.id === utilityId);
    if (!utility || utility.activeAttempt?.id !== attemptId) throw new Error("Request Attempt is no longer active");
    utility.format = plan.format;
    utility.acceptedPlan = plan;
    utility.behaviorContract = plan.behaviorContract;
    utility.timeline.push({ id: `${attemptId}:plan`, kind: "accepted_plan", createdAt, content: { text: plan.summary } });
    utility.updatedAt = createdAt;
  });
  emitTimelineItem(utilityId, { id: `${attemptId}:plan`, kind: "accepted_plan", createdAt, content: { text: plan.summary } });
  emit({ type: "plan_accepted", attemptId, plan: { summary: plan.summary } });
}

function timelineTitle(kind: string): string {
  if (kind === "build_request") return "Build Request";
  if (kind === "revision_request") return "Revision Request";
  if (kind === "accepted_plan") return "Accepted Plan";
  if (kind === "verification") return "Verification Evidence";
  if (kind === "ready") return "Ready";
  return "Clarification";
}

function timelineText(entry: OwnerTimelineEntry): string {
  return entry.content.text
    ?? (entry.content.answers ? `Clarification answered: ${Object.keys(entry.content.answers).length} response(s)` : "Clarification requested");
}

function emitTimelineItem(utilityId: string, entry: OwnerTimelineEntry): void {
  emit({
    type: "timeline_item",
    utilityId,
    entryId: entry.id,
    kind: timelineTitle(entry.kind),
    createdAt: entry.createdAt,
    text: timelineText(entry).slice(0, 1_000),
  });
}

async function appendAttemptTimeline(
  utilityId: string,
  attemptId: string,
  id: string,
  kind: OwnerTimelineEntry["kind"],
  text: string,
): Promise<void> {
  const entry: OwnerTimelineEntry = { id, kind, createdAt: nowIso(), content: { text } };
  await registry.update((current) => {
    const utility = current.utilities.find((candidate) => candidate.id === utilityId);
    if (!utility || utility.activeAttempt?.id !== attemptId) throw new Error("Request Attempt is no longer active");
    if (!utility.timeline.some((candidate) => candidate.id === id)) utility.timeline.push(entry);
    utility.updatedAt = entry.createdAt;
  });
  emitTimelineItem(utilityId, entry);
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

async function runAttempt(attempt: ActiveAttempt, resumeExisting = false): Promise<void> {
  let utility: UtilityRecord | undefined;
  try {
    if (resumeExisting) {
      utility = (await registry.read()).utilities.find((candidate) => candidate.activeAttempt?.id === attempt.id);
      if (!utility) throw new Error("Request Attempt is unavailable for resume");
    } else {
      utility = await ensureUtility(attempt.command, attempt.id);
      const requestEntry = utility.timeline.find((entry) => entry.id === attempt.command.requestId);
      if (requestEntry) emitTimelineItem(utility.id, requestEntry);
    }
    const sourceRoot = path.join(dataRoot, utility.folder, "source");
    const utilityRoot = path.join(dataRoot, utility.folder);
    const evidenceRoot = path.join(utilityRoot, "evidence", attempt.id);
    const releaseRoot = path.join(utilityRoot, "artifacts", attempt.id);
    const resourcesRoot = process.env.REPLICATOR_RESOURCES_ROOT;
    if (!resourcesRoot) throw new Error("packaged resources root is required");
    const nativeCliPath = process.env.REPLICATOR_NATIVE_PATH
      ?? (resourcesRoot ? path.join(resourcesRoot, "toolchains", "native-cli", "bin", "native.js") : undefined);
    const nativeZigPath = process.env.NATIVE_SDK_ZIG
      ?? (resourcesRoot ? path.join(resourcesRoot, "toolchains", "zig", "zig") : undefined);
    if (!nativeCliPath || !nativeZigPath) throw new Error("bundled Native CLI and Zig paths are required");
    const adapter = new BoundedNativeAdapter({
      nodeExecutable: process.execPath,
      nativeCliPath,
      nativeZigPath,
      nativeSdkHome: process.env.NATIVE_SDK_HOME ?? path.join(dataRoot, "native-sdk"),
      utilityRoot,
      projectRoot: sourceRoot,
      evidenceRoot,
      releaseRoot,
    });
    if (!resumeExisting) {
      await prepareSource(attempt.command, attempt.id, utility, adapter, attempt.abortController.signal);
    }
    emit({ type: "state_changed", attemptId: attempt.id, state: "planning" });

    const sessionConfigDir = path.join(utilityRoot, "agent-session");
    await mkdir(sessionConfigDir, { recursive: true, mode: 0o700 });
    const references = agentReferences(attempt.command);
    const guidance = await NativeGuidance.load(resourcesRoot);
    const reusablePlan = attempt.command.kind === "build" && utility.acceptedPlan && utility.session.activeId
      ? { plan: utility.acceptedPlan, sessionId: utility.session.activeId }
      : undefined;
    const { plan, sessionId } = reusablePlan
      ?? await acceptPlan(attempt, utility, sourceRoot, sessionConfigDir, guidance);
    await persistPlan(utility.id, attempt.id, plan);
    await setState(utility.id, attempt.id, "building");
    let verification: VerificationOutcome | undefined;
    let finalization: FinalizationOutcome | undefined;
    const finalizationNonce = randomUUID();
    await registry.update((current) => {
      const stored = current.utilities.find((candidate) => candidate.id === utility!.id);
      if (!stored?.activeAttempt || stored.activeAttempt.id !== attempt.id) throw new Error("Request Attempt is no longer active");
      stored.activeAttempt.finalizationNonce = finalizationNonce;
      stored.updatedAt = nowIso();
    });
    const editableFiles = ["app.zon", "src/app.native", "src/core.ts"] as const;
    const readEditable = async (file: string): Promise<string> => {
      if (!editableFiles.includes(file as (typeof editableFiles)[number])) throw new Error("source path is not editable for bounded Native");
      const contents = await readFile(path.join(sourceRoot, file), "utf8");
      if (Buffer.byteLength(contents) > 120 * 1024) throw new Error("source file exceeds the read limit");
      return contents;
    };
    const implementation = createAgenticImplementation({
      listSourceFiles: async () => [...editableFiles],
      readSource: readEditable,
      editSource: async (file, oldText, newText, replaceAll) => {
        const contents = await readEditable(file);
        const matches = contents.split(oldText).length - 1;
        if (matches === 0 || (!replaceAll && matches !== 1)) throw new Error("edit oldText must match exactly once unless replaceAll is true");
        const next = replaceAll ? contents.replaceAll(oldText, newText) : contents.replace(oldText, newText);
        await adapter.writeSource(file, next);
      },
      currentDigest: () => sourceDigest(sourceRoot, "native-bounded"),
      validate: async () => {
        const outcomes = await adapter.validate(attempt.abortController.signal);
        return outcomes.map((outcome) => `${outcome.summary} (${outcome.durationMs} ms)`).join("\n");
      },
      verify: async () => {
        await setState(utility!.id, attempt.id, "verifying");
        verification = await adapter.verify(plan.behaviorContract, attempt.abortController.signal);
        const summary = `${verification.scenarioResults.length} accepted Behavior Scenarios passed with ${verification.screenshots.length} screenshots`;
        await appendAttemptTimeline(utility!.id, attempt.id, `${attempt.id}:verification`, "verification", summary);
        return summary;
      },
      repairScope: (error) => error instanceof AdapterFailure ? error.repairScope : "host",
      reopenSourceRepair: async (error) => {
        if (!(error instanceof AdapterFailure)) throw new Error("only an adapter source failure can reopen editing");
        await adapter.reopenSourceRepair(error);
      },
      finalize: async () => {
        await setState(utility!.id, attempt.id, "preparing");
        await mkdir(evidenceRoot, { recursive: true, mode: 0o700 });
        await writeFile(
          path.join(evidenceRoot, "native-guidance.json"),
          `${JSON.stringify({ selections: plan.nativeGuidance, reads: guidance.readTelemetry() }, null, 2)}\n`,
          { encoding: "utf8", mode: 0o600 },
        );
        finalization = await adapter.finalize(
          plan.behaviorContract.scenarios.map((scenario) => scenario.id),
          attempt.abortController.signal,
        );
        emit({
          type: "stage_result",
          attemptId: attempt.id,
          stage: "packaging",
          ok: true,
          summary: "Verified standalone App package created without rebuilding",
        });
        emit({
          type: "stage_result",
          attemptId: attempt.id,
          stage: "launch",
          ok: true,
          summary: "Standalone App launched successfully",
          durationMs: finalization.launchDurationMs,
        });
        return "The host packaged and launched the exact verified binary.";
      },
      onStage: (stage, ok, summary) => emit({
        type: "stage_result",
        attemptId: attempt.id,
        stage,
        ok,
        summary: redactError(summary),
      }),
    });
    const route = routeModel("build", plan.format, attempt.command.modelOverride, attempt.command.effortOverride);
    const instruction = systemInstruction("build", plan.format);
    const buildPrompt = [
      "Implement the host-accepted bounded Native plan in this resumed Session.",
      `Owner request: ${attempt.command.requestText}`,
      `Accepted plan and immutable Behavior Contract: ${JSON.stringify(plan)}`,
      "Keep app.zon name generated-app. Do not use dependencies, scripts, nested modules, or unrequested features.",
      "Native 0.8.1 markup does not support HTML id or data-* attributes. Give every interactive or asserted scenario target a unique accessible label exactly matching the immutable Behavior Scenario target; labels, visible text, and Native automation replace DOM selectors.",
      "For an asserted dynamic text value, put the scenario label on a container and render the value in an unlabeled child <text>. A label on <text> replaces its visible value in Native automation snapshots.",
      "Native message payloads use tag:value for a constant and tag:{binding} for one model binding. Never wrap a quoted constant inside binding braces.",
      "In a TypeScript core, declare update-only fields and host-fired messages with export const viewUnbound = [\"fieldName\", \"messageKind\"] as const. The snake_case view_unbound spelling is Zig-only and will fail native check --strict.",
      "Never create zero-size, transparent, off-canvas, or otherwise invisible widgets just to satisfy the model-contract checker. Declare legitimately update-only state and host-fired messages in viewUnbound instead.",
      "Read every approved official component section through the guidance tools before editing the component it governs. No unapproved guidance is available during coding.",
      "Inspect source with list_app_files and read_app, then use edit_app for exact replacements. Call validate_app and repair its exact diagnostics in this same turn. Then call verify_behavior for the immutable host contract; if behavior fails, make a focused repair, validate again, and retry. Call finalize_app exactly once as your final tool action, then return the structured summary. Do not claim completion without finalization.",
    ].join("\n");
    await withDeadline(
      attempt,
      FINALIZATION_RESERVE_MS,
      () => runStructuredAgentTurn({
        cwd: sourceRoot,
        sessionConfigDir,
        prompt: buildPrompt,
        resumeSessionId: sessionId,
        abortController: attempt.abortController,
        outputSchema: buildOutputSchema,
        validateOutput: validateBuildResult,
        model: route.model,
        effort: route.effort,
        systemInstruction: instruction.text,
        mcpServers: {
          replicator: implementation.server,
          guidance: createCodingGuidance(guidance, plan.nativeGuidance),
          ...(references.length > 0 ? { references: createReferenceReader(references) } : {}),
        },
        allowedTools: [
          "mcp__replicator__list_app_files",
          "mcp__replicator__read_app",
          "mcp__replicator__edit_app",
          "mcp__replicator__validate_app",
          "mcp__replicator__verify_behavior",
          "mcp__replicator__finalize_app",
          "mcp__guidance__read_native_guide",
          "mcp__guidance__read_native_doc",
          ...(references.length > 0 ? ["mcp__references__read_reference_image"] : []),
        ],
        maxTurns: 40,
        onInitialized: async (initialized) => {
          if (initialized.sessionId !== sessionId) throw new Error("Agent SDK did not resume the App Session");
          await registry.persistSession(utility!.id, initialized.sessionId);
          assertResolvedModel(initialized.resolvedModel, route.model);
          await registry.persistQuery(utility!.id, attempt.id, {
            phase: "build",
            instructionVersion: instruction.version,
            instructionDigest: instruction.digest,
            logicalModel: route.model,
            effort: route.effort,
            resolvedModel: initialized.resolvedModel,
            routeReason: route.reason,
          });
          emit({ type: "session_initialized", utilityId: utility!.id, sessionId: initialized.sessionId });
        },
      }),
    );
    const acceptedTools = implementation.toolTelemetry();
    const finalTool = acceptedTools.at(-1);
    if (!finalTool || finalTool.tool !== "finalize_app" || finalTool.outcome !== "accepted") {
      throw new Error("finalize_app was not the final accepted implementation tool");
    }
    const agentFinalizedDigest = implementation.finalizedDigest();
    if (!agentFinalizedDigest || agentFinalizedDigest !== await sourceDigest(sourceRoot, "native-bounded")) {
      throw new Error("Agent implementation ended without finalizing the current source digest");
    }

    if (!verification || !finalization) throw new Error("finalize_app did not return complete verification and package evidence");
    await writeFile(
      path.join(evidenceRoot, "agent-tools.json"),
      `${JSON.stringify({ tools: implementation.toolTelemetry() }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    const persistedAttempt = (await registry.read()).utilities.find((candidate) => candidate.id === utility!.id)?.activeAttempt;
    if (persistedAttempt?.id !== attempt.id || persistedAttempt.finalizationNonce !== finalizationNonce) {
      throw new Error("finalization nonce is stale or unavailable");
    }
    if (
      finalization.attestationInputs.sourceDigest !== agentFinalizedDigest ||
      finalization.attestationInputs.verifiedBinaryDigest !== verification.candidate.binaryDigest ||
      finalization.attestationInputs.verifiedAssetsDigest !== verification.candidate.assetsDigest ||
      finalization.attestationInputs.packagedBinaryDigest !== finalization.artifact.binaryDigest
    ) throw new Error("finalization attestation inputs do not match verified evidence");
    const attestation = {
      version: 1,
      nonce: finalizationNonce,
      attemptId: attempt.id,
      acceptedAt: nowIso(),
      artifact: finalization.artifact,
      inputs: finalization.attestationInputs,
    };
    const attestationBytes = `${JSON.stringify(attestation, null, 2)}\n`;
    const attestationDigest = createHash("sha256").update(attestationBytes).digest("hex");
    const attestationFile = path.join(evidenceRoot, "accepted-finalization-attestation.json");
    await writeFile(attestationFile, attestationBytes, { encoding: "utf8", mode: 0o600 });
    const artifactPath = path.relative(dataRoot, path.join(releaseRoot, finalization.artifact.path));
    const screenshots = verification.screenshots.map((screenshot) => path.relative(dataRoot, path.join(evidenceRoot, screenshot)));
    const scenarioResults = verification.scenarioResults.map((result) => ({
      ...result,
      screenshots: result.screenshots.map((screenshot) => path.relative(dataRoot, path.join(evidenceRoot, screenshot))),
    }));
    const artifact = { ...finalization.artifact, path: artifactPath };
    await registry.update((current) => {
      const stored = current.utilities.find((candidate) => candidate.id === utility!.id);
      if (!stored || stored.activeAttempt?.id !== attempt.id) throw new Error("Request Attempt is no longer active");
      stored.state = "ready";
      stored.readyArtifact = {
        ...artifact,
        evidencePath: path.relative(dataRoot, evidenceRoot),
        attestationPath: path.relative(dataRoot, attestationFile),
        attestationDigest,
        screenshots,
        scenarioResults,
        createdAt: nowIso(),
      };
      stored.timeline.push({
        id: `${attempt.id}:ready`,
        kind: "ready",
        createdAt: stored.readyArtifact.createdAt,
        content: { text: "Built, verified, and ready to launch." },
      });
      delete stored.activeAttempt;
      delete stored.lastError;
      stored.updatedAt = nowIso();
    });
    if (attempt.command.kind === "revision") {
      await rm(path.join(utilityRoot, "snapshots", attempt.id), { recursive: true, force: true });
    }
    emit({ type: "artifact_ready", attemptId: attempt.id, artifact, screenshots, scenarioResults });
    emitTimelineItem(utility.id, {
      id: `${attempt.id}:ready`,
      kind: "ready",
      createdAt: (await registry.read()).utilities.find((candidate) => candidate.id === utility!.id)!.readyArtifact!.createdAt,
      content: { text: "Built, verified, and ready to launch." },
    });
    emit({ type: "state_changed", attemptId: attempt.id, state: "ready" });
  } catch (error) {
    if (error instanceof ClarificationPause) return;
    if (utility) await finishFailure(attempt, utility, error);
    else logError(error);
  } finally {
    active = undefined;
    if (shutdownRequested) setImmediate(() => process.exit(0));
  }
}

async function answerClarification(command: AnswerClarificationCommand): Promise<void> {
  const persisted = (await registry.read()).utilities.find((candidate) => candidate.activeAttempt?.id === command.attemptId);
  const pending = active?.id === command.attemptId && active.clarification
    ? { batchId: active.clarification.batchId, questions: active.clarification.questions }
    : persisted?.activeAttempt?.pendingClarification;
  if (!pending) throw new Error("Clarification is not awaiting answers");
  if (pending.batchId !== command.batchId) throw new Error("Clarification batch does not match");
  if (Object.keys(command.answers).length !== pending.questions.length) throw new Error("Every Clarification question requires one answer");
  for (const question of pending.questions) {
    const answer = command.answers[question.id];
    if (!answer) throw new Error(`Clarification answer is missing: ${question.id}`);
    if (question.answerKind === "choice" && !question.options?.includes(answer)) throw new Error(`Clarification answer is not an offered option: ${question.id}`);
  }
  if (active?.id === command.attemptId && active.clarification) {
    active.clarification.resolve(command.answers);
    return;
  }
  if (!persisted?.activeAttempt?.command) throw new Error("Clarification Request Attempt cannot be resumed");
  await saveClarification(persisted.id, command.batchId, command.answers);
  await registry.update((current) => {
    const utility = current.utilities.find((candidate) => candidate.id === persisted.id);
    if (!utility?.activeAttempt || utility.activeAttempt.id !== command.attemptId) throw new Error("Request Attempt is no longer active");
    delete utility.activeAttempt.pendingClarification;
    utility.state = "planning";
    utility.updatedAt = nowIso();
  });
  const attempt: ActiveAttempt = {
    id: command.attemptId,
    command: persisted.activeAttempt.command,
    abortController: new AbortController(),
    activeStartedAt: Date.now(),
    activeElapsedMs: persisted.activeAttempt.activeElapsedMs,
    cancelRequested: false,
  };
  active = attempt;
  await runAttempt(attempt, true);
}

async function cancelAttempt(attemptId: string): Promise<void> {
  if (active?.id === attemptId) {
    active.cancelRequested = true;
    active.abortController.abort();
    active.clarification?.reject(new Error("Request Attempt cancelled"));
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    return;
  }
  const persisted = (await registry.read()).utilities.find((utility) => utility.activeAttempt?.id === attemptId);
  if (!persisted?.activeAttempt?.command) throw new Error("Request Attempt is not active");
  const interrupted: ActiveAttempt = {
    id: attemptId,
    command: persisted.activeAttempt.command,
    abortController: new AbortController(),
    activeStartedAt: Date.now(),
    activeElapsedMs: persisted.activeAttempt.activeElapsedMs,
    cancelRequested: true,
  };
  await finishFailure(interrupted, persisted, new Error("Request Attempt cancelled"));
}

async function loadRegistry(command: LoadRegistryCommand): Promise<void> {
  const current = await registry.read();
  const utilities = [...current.utilities]
    .filter((utility) => !utility.deletedAt)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const libraryCursor = command.libraryCursor ?? 0;
  const libraryPage = utilities.slice(libraryCursor, libraryCursor + command.libraryLimit);
  for (const utility of libraryPage) {
    emit({
      type: "library_item",
      utilityId: utility.id,
      displayName: utility.displayName.slice(0, 200),
      format: utility.format,
      state: utility.state,
      updatedAt: utility.updatedAt,
      ...(utility.readyArtifact ? {
        artifactPath: utility.readyArtifact.path,
        sourceDigest: utility.readyArtifact.sourceDigest,
        binaryDigest: utility.readyArtifact.binaryDigest,
      } : {}),
    });
  }
  const selected = utilities.find((utility) => utility.id === command.selectedUtilityId) ?? utilities[0];
  const timeline = selected ? [...selected.timeline] : [];
  if (selected?.readyArtifact && !timeline.some((entry) => entry.kind === "ready")) {
    const createdAt = selected.readyArtifact.createdAt;
    if (selected.acceptedPlan && !timeline.some((entry) => entry.kind === "accepted_plan")) {
      timeline.push({ id: "current:plan", kind: "accepted_plan", createdAt, content: { text: selected.acceptedPlan.summary } });
    }
    if (!timeline.some((entry) => entry.kind === "verification")) {
      timeline.push({
        id: "current:verification",
        kind: "verification",
        createdAt,
        content: { text: `${selected.readyArtifact.scenarioResults.length} accepted Behavior Scenarios passed with ${selected.readyArtifact.screenshots.length} screenshots` },
      });
    }
    timeline.push({ id: "current:ready", kind: "ready", createdAt, content: { text: "Built, verified, and ready to launch." } });
  }
  timeline.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const timelineCursor = command.timelineCursor ?? 0;
  const timelinePage = timeline.slice(timelineCursor, timelineCursor + command.timelineLimit);
  for (const entry of timelinePage) {
    emitTimelineItem(selected!.id, entry);
  }
  emit({
    type: "registry_loaded",
    selectedUtilityId: selected?.id ?? "",
    ...(libraryCursor + libraryPage.length < utilities.length ? { nextLibraryCursor: libraryCursor + libraryPage.length } : {}),
    ...(timelineCursor + timelinePage.length < timeline.length ? { nextTimelineCursor: timelineCursor + timelinePage.length } : {}),
  });
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

async function dispatchCommand(line: string, waitForAttempt: boolean): Promise<void> {
  const command = decodeHostCommand(line);
  if (command.type === "load_registry") {
    await loadRegistry(command);
    return;
  }
  if (command.type === "start_attempt") {
    if (active) throw new Error("a Request Attempt is already active");
    if ((await registry.read()).utilities.some((utility) => utility.activeAttempt)) throw new Error("a Request Attempt is already active");
    const preparedCommand = await normalizeStartReferences(command);
    const attempt: ActiveAttempt = {
      id: randomUUID(),
      command: preparedCommand,
      abortController: new AbortController(),
      activeStartedAt: Date.now(),
      activeElapsedMs: 0,
      cancelRequested: false,
    };
    active = attempt;
    if (waitForAttempt) await runAttempt(attempt);
    else void runAttempt(attempt);
    return;
  }
  if (command.type === "answer_clarification") {
    await answerClarification(command);
    return;
  }
  await cancelAttempt(command.attemptId);
}

async function commandFileContents(relativePath: string): Promise<string> {
  if (relativePath.length === 0 || relativePath.length > 1_024 || path.isAbsolute(relativePath) || relativePath.includes("\\") || relativePath.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("worker command path must be a normalized relative path");
  }
  const absolutePath = path.join(dataRoot, relativePath);
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 1024 * 1024) throw new Error("worker command file is invalid");
  const contents = await readFile(absolutePath, "utf8");
  if (contents.includes("\n") && contents.trimEnd().includes("\n")) throw new Error("worker command file must contain one JSON object");
  return contents.trim();
}

const commandFile = process.argv[2];
if (commandFile !== undefined) {
  if (process.argv.length !== 3) throw new Error("worker accepts exactly one command-file argument");
  try {
    await dispatchCommand(await commandFileContents(commandFile), true);
  } catch (error) {
    logError(error);
    process.exitCode = 1;
  }
} else {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    if (line.trim().length === 0) continue;
    try {
      await dispatchCommand(line, false);
    } catch (error) {
      logError(error);
    }
  }
}
