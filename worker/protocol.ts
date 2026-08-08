export type UtilityFormat = "native-bounded" | "native-multimodule" | "react-webview";

export type UtilityState =
  | "planning"
  | "awaiting_clarification"
  | "building"
  | "verifying"
  | "preparing"
  | "ready"
  | "failed"
  | "interrupted";

export type RequestKind = "build" | "revision";
export type ModelOverride = "haiku" | "sonnet";
export type EffortOverride = "low" | "medium";

export type ReferenceImageMetadata = {
  id: string;
  path: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  byteLength: number;
  width: number;
  height: number;
};

export type ReadyArtifactMetadata = {
  path: string;
  sourceDigest: string;
  binaryDigest: string;
};

export type StartAttemptCommand = {
  type: "start_attempt";
  utilityId: string;
  requestId: string;
  kind: RequestKind;
  requestText: string;
  references: ReferenceImageMetadata[];
  currentSourceDigest?: string;
  readyArtifact?: ReadyArtifactMetadata;
  modelOverride?: ModelOverride;
  effortOverride?: EffortOverride;
};

export type AnswerClarificationCommand = {
  type: "answer_clarification";
  attemptId: string;
  batchId: string;
  answers: Record<string, string>;
};

export type CancelAttemptCommand = { type: "cancel_attempt"; attemptId: string };
export type LoadRegistryCommand = {
  type: "load_registry";
  selectedUtilityId?: string;
  libraryLimit: number;
  timelineLimit: number;
  libraryCursor?: number;
  timelineCursor?: number;
};

export type HostCommand =
  | LoadRegistryCommand
  | StartAttemptCommand
  | AnswerClarificationCommand
  | CancelAttemptCommand;

export type ClarificationQuestion = {
  id: string;
  question: string;
  answerKind: "choice" | "short_text";
  options?: string[];
};

export type BehaviorStep =
  | { action: "launch" }
  | { action: "click"; target: string }
  | { action: "input"; target: string; value: string }
  | { action: "wait"; milliseconds: number }
  | { action: "assert_text"; target: string; value: string }
  | { action: "assert_visible"; target: string }
  | { action: "screenshot"; name: string };

export type BehaviorScenario = {
  id: string;
  title: string;
  purpose: "primary" | "newest_change" | "preserved_behavior" | "high_risk";
  steps: BehaviorStep[];
};

export type BehaviorContract = { scenarios: BehaviorScenario[] };

export type NativeGuidanceSelection =
  | {
      corpus: "skill";
      id: "native-ui" | "ts-core" | "automation" | "core" | "zig";
      sectionIds: string[];
      digest: string;
      purpose: string;
    }
  | {
      corpus: "official";
      id: `docs/${string}.md`;
      sectionIds: string[];
      digest: string;
      purpose: string;
      component?: { element: string; bindings: string[]; events: string[] };
    };

export type AcceptedPlan = {
  summary: string;
  format: UtilityFormat;
  behaviorContract: BehaviorContract;
  formatReason: string;
  primaryWorkflow: string;
  requirements: Array<{ sourceQuote: string; acceptance: string }>;
  decisions: string[];
  nativeGuidance: NativeGuidanceSelection[];
};

export type ScenarioResult = {
  scenarioId: string;
  passed: boolean;
  durationMs: number;
  summary: string;
  screenshots: string[];
};

export type WorkerEvent =
  | {
      type: "library_item";
      utilityId: string;
      displayName: string;
      format: UtilityFormat;
      state: UtilityState;
      updatedAt: string;
      artifactPath?: string;
      sourceDigest?: string;
      binaryDigest?: string;
    }
  | { type: "timeline_item"; utilityId: string; entryId: string; kind: string; createdAt: string; text: string }
  | { type: "registry_loaded"; selectedUtilityId: string; nextLibraryCursor?: number; nextTimelineCursor?: number }
  | { type: "session_initialized"; utilityId: string; sessionId: string }
  | { type: "state_changed"; attemptId: string; state: UtilityState }
  | {
      type: "clarification_required";
      attemptId: string;
      batchId: string;
      questions: ClarificationQuestion[];
    }
  | { type: "plan_accepted"; attemptId: string; plan: AcceptedPlan }
  | {
      type: "stage_result";
      attemptId: string;
      stage: "validation" | "repair" | "verification" | "packaging" | "launch";
      ok: boolean;
      summary: string;
      durationMs?: number;
    }
  | {
      type: "artifact_ready";
      attemptId: string;
      artifact: ReadyArtifactMetadata;
      screenshots: string[];
      scenarioResults: ScenarioResult[];
    }
  | { type: "attempt_failed"; attemptId: string; reason: string; rollback: string }
  | { type: "attempt_interrupted"; attemptId: string; reason: string; rollback: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string, maximum = 4096): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new Error(`${field} must be a non-empty string no longer than ${maximum} characters`);
  }
  return value;
}

function requireIdentifier(value: unknown, field: string): string {
  const identifier = requireString(value, field, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(identifier)) {
    throw new Error(`${field} must contain only letters, numbers, underscores, or hyphens`);
  }
  return identifier;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
  return value;
}

function rejectUnknownFields(value: Record<string, unknown>, allowed: readonly string[]): void {
  const unknown = Object.keys(value).find((field) => !allowed.includes(field));
  if (unknown) throw new Error(`unknown command field: ${unknown}`);
}

function decodeReference(value: unknown, index: number): ReferenceImageMetadata {
  if (!isRecord(value)) throw new Error(`references.${index} must be an object`);
  rejectUnknownFields(value, ["id", "path", "mediaType", "byteLength", "width", "height"]);
  if (value.mediaType !== "image/png" && value.mediaType !== "image/jpeg" && value.mediaType !== "image/webp") {
    throw new Error(`references.${index}.mediaType is unsupported`);
  }
  const reference: ReferenceImageMetadata = {
    id: requireString(value.id, `references.${index}.id`, 128),
    path: requireString(value.path, `references.${index}.path`, 1024),
    mediaType: value.mediaType,
    byteLength: requireNumber(value.byteLength, `references.${index}.byteLength`),
    width: requireNumber(value.width, `references.${index}.width`),
    height: requireNumber(value.height, `references.${index}.height`),
  };
  if (reference.byteLength > 5 * 1024 * 1024) throw new Error(`references.${index} exceeds 5 MB`);
  if (reference.width === 0 || reference.height === 0 || Math.max(reference.width, reference.height) > 2000) {
    throw new Error(`references.${index} must be normalized to at most 2000 px`);
  }
  return reference;
}

function decodeReadyArtifact(value: unknown): ReadyArtifactMetadata {
  if (!isRecord(value)) throw new Error("readyArtifact must be an object");
  rejectUnknownFields(value, ["path", "sourceDigest", "binaryDigest"]);
  return {
    path: requireString(value.path, "readyArtifact.path", 1024),
    sourceDigest: requireString(value.sourceDigest, "readyArtifact.sourceDigest", 128),
    binaryDigest: requireString(value.binaryDigest, "readyArtifact.binaryDigest", 128),
  };
}

export function decodeHostCommand(line: string): HostCommand {
  const value: unknown = JSON.parse(line);
  if (!isRecord(value)) throw new Error("command must be an object");
  const type = requireString(value.type, "type", 64);

  if (type === "load_registry") {
    rejectUnknownFields(value, ["type", "selectedUtilityId", "libraryLimit", "timelineLimit", "libraryCursor", "timelineCursor"]);
    const boundedPage = (input: unknown, field: string, maximum: number): number => {
      if (typeof input !== "number" || !Number.isInteger(input) || input < 1 || input > maximum) throw new Error(`${field} is invalid`);
      return input;
    };
    const cursor = (input: unknown, field: string): number | undefined => {
      if (input === undefined) return undefined;
      if (typeof input !== "number" || !Number.isInteger(input) || input < 0 || input > 100_000) throw new Error(`${field} is invalid`);
      return input;
    };
    return {
      type,
      ...(value.selectedUtilityId === undefined ? {} : { selectedUtilityId: requireIdentifier(value.selectedUtilityId, "selectedUtilityId") }),
      libraryLimit: boundedPage(value.libraryLimit, "libraryLimit", 100),
      timelineLimit: boundedPage(value.timelineLimit, "timelineLimit", 100),
      ...(cursor(value.libraryCursor, "libraryCursor") === undefined ? {} : { libraryCursor: cursor(value.libraryCursor, "libraryCursor")! }),
      ...(cursor(value.timelineCursor, "timelineCursor") === undefined ? {} : { timelineCursor: cursor(value.timelineCursor, "timelineCursor")! }),
    };
  }

  if (type === "cancel_attempt") {
    rejectUnknownFields(value, ["type", "attemptId"]);
    return { type, attemptId: requireIdentifier(value.attemptId, "attemptId") };
  }

  if (type === "answer_clarification") {
    rejectUnknownFields(value, ["type", "attemptId", "batchId", "answers"]);
    if (!isRecord(value.answers)) throw new Error("answers must be an object");
    const entries = Object.entries(value.answers);
    if (entries.length === 0 || entries.length > 12) throw new Error("answers must contain 1 to 12 entries");
    const answers = Object.fromEntries(
      entries.map(([key, answer]) => [requireString(key, "answer id", 128), requireString(answer, `answers.${key}`, 2000)]),
    );
    return {
      type,
      attemptId: requireIdentifier(value.attemptId, "attemptId"),
      batchId: requireIdentifier(value.batchId, "batchId"),
      answers,
    };
  }

  if (type !== "start_attempt") throw new Error(`unknown command type: ${type}`);
  rejectUnknownFields(value, [
    "type", "utilityId", "requestId", "kind", "requestText", "references",
    "currentSourceDigest", "readyArtifact", "modelOverride", "effortOverride",
  ]);
  if (value.kind !== "build" && value.kind !== "revision") throw new Error("kind must be build or revision");
  if (!Array.isArray(value.references) || value.references.length > 4) {
    throw new Error("references must be an array of at most four images");
  }

  const command: StartAttemptCommand = {
    type,
    utilityId: requireIdentifier(value.utilityId, "utilityId"),
    requestId: requireIdentifier(value.requestId, "requestId"),
    kind: value.kind,
    requestText: requireString(value.requestText, "requestText", 20_000),
    references: value.references.map(decodeReference),
  };
  if (value.currentSourceDigest !== undefined) command.currentSourceDigest = requireString(value.currentSourceDigest, "currentSourceDigest", 128);
  if (value.readyArtifact !== undefined) command.readyArtifact = decodeReadyArtifact(value.readyArtifact);
  if (value.modelOverride !== undefined) {
    if (value.modelOverride !== "haiku" && value.modelOverride !== "sonnet") throw new Error("modelOverride must be haiku or sonnet");
    command.modelOverride = value.modelOverride;
  }
  if (value.effortOverride !== undefined) {
    if (value.effortOverride !== "low" && value.effortOverride !== "medium") throw new Error("effortOverride must be low or medium");
    command.effortOverride = value.effortOverride;
  }
  if (command.kind === "revision" && (!command.currentSourceDigest || !command.readyArtifact)) {
    throw new Error("Revision requires currentSourceDigest and readyArtifact");
  }
  if (command.kind === "build" && (command.currentSourceDigest || command.readyArtifact)) {
    throw new Error("Build must not include existing source or Ready Artifact metadata");
  }
  return command;
}

export function encodeWorkerEvent(event: WorkerEvent): string {
  return JSON.stringify(event);
}
