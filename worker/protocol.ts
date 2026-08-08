export type UtilityFormat =
  | "native-bounded"
  | "native-multimodule"
  | "react-webview";

export type UtilityState =
  | "planning"
  | "awaiting_clarification"
  | "building"
  | "verifying"
  | "preparing"
  | "ready"
  | "failed"
  | "interrupted";

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
  kind: "build" | "revision";
  requestText: string;
  references: ReferenceImageMetadata[];
  currentSourceDigest?: string;
  readyArtifact?: ReadyArtifactMetadata;
};

export type AnswerClarificationCommand = {
  type: "answer_clarification";
  attemptId: string;
  batchId: string;
  answers: Record<string, string>;
};

export type CancelAttemptCommand = {
  type: "cancel_attempt";
  attemptId: string;
};

export type HostCommand =
  | StartAttemptCommand
  | AnswerClarificationCommand
  | CancelAttemptCommand;

export type BehaviorScenario = {
  id: string;
  title: string;
  steps: unknown[];
};

export type WorkerEvent =
  | { type: "session_initialized"; utilityId: string; sessionId: string }
  | { type: "state_changed"; attemptId: string; state: UtilityState }
  | {
      type: "clarification_required";
      attemptId: string;
      batchId: string;
      questions: unknown[];
    }
  | {
      type: "plan_accepted";
      attemptId: string;
      plan: string;
      format: UtilityFormat;
      behaviorContract: BehaviorScenario[];
    }
  | {
      type: "stage_result";
      attemptId: string;
      stage: string;
      ok: boolean;
      summary: string;
    }
  | {
      type: "artifact_ready";
      attemptId: string;
      artifact: ReadyArtifactMetadata;
      screenshots: string[];
      scenarioResults: unknown[];
    }
  | { type: "attempt_failed"; attemptId: string; reason: string; rollback: string }
  | {
      type: "attempt_interrupted";
      attemptId: string;
      reason: string;
      rollback: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

export function decodeHostCommand(line: string): HostCommand {
  const value: unknown = JSON.parse(line);
  if (!isRecord(value)) throw new Error("command must be an object");

  const type = requireString(value.type, "type");
  if (type === "cancel_attempt") {
    return {
      type,
      attemptId: requireString(value.attemptId, "attemptId"),
    };
  }

  if (type === "answer_clarification") {
    if (!isRecord(value.answers)) throw new Error("answers must be an object");
    const answers: Record<string, string> = {};
    for (const [key, answer] of Object.entries(value.answers)) {
      answers[key] = requireString(answer, `answers.${key}`);
    }
    return {
      type,
      attemptId: requireString(value.attemptId, "attemptId"),
      batchId: requireString(value.batchId, "batchId"),
      answers,
    };
  }

  if (type !== "start_attempt") throw new Error(`unknown command type: ${type}`);
  if (value.kind !== "build" && value.kind !== "revision") {
    throw new Error("kind must be build or revision");
  }
  if (!Array.isArray(value.references)) throw new Error("references must be an array");

  const command: StartAttemptCommand = {
    type,
    utilityId: requireString(value.utilityId, "utilityId"),
    requestId: requireString(value.requestId, "requestId"),
    kind: value.kind,
    requestText: requireString(value.requestText, "requestText"),
    references: value.references as ReferenceImageMetadata[],
  };
  if (value.currentSourceDigest !== undefined) {
    command.currentSourceDigest = requireString(
      value.currentSourceDigest,
      "currentSourceDigest",
    );
  }
  if (value.readyArtifact !== undefined) {
    if (!isRecord(value.readyArtifact)) throw new Error("readyArtifact must be an object");
    command.readyArtifact = value.readyArtifact as ReadyArtifactMetadata;
  }
  return command;
}

export function encodeWorkerEvent(event: WorkerEvent): string {
  return JSON.stringify(event);
}
