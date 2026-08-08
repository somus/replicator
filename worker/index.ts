import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { runAgentSession } from "./agent.js";
import {
  decodeHostCommand,
  encodeWorkerEvent,
  type StartAttemptCommand,
  type WorkerEvent,
} from "./protocol.js";
import { RegistryStore } from "./registry.js";

const configuredDataRoot = process.env.REPLICATOR_DATA_ROOT;
if (!configuredDataRoot) throw new Error("REPLICATOR_DATA_ROOT is required");
const dataRoot: string = configuredDataRoot;

const registry = new RegistryStore(dataRoot);
await registry.initialize();

let active: { id: string; abortController: AbortController } | undefined;

function emit(event: WorkerEvent): void {
  process.stdout.write(`${encodeWorkerEvent(event)}\n`);
}

function logError(error: unknown): void {
  let message = error instanceof Error ? error.message : String(error);
  for (const sensitivePath of [process.env.HOME, dataRoot]) {
    if (sensitivePath) message = message.replaceAll(sensitivePath, "<redacted-path>");
  }
  message = message.replace(/sk-ant-[A-Za-z0-9_-]+/g, "<redacted-credential>");
  process.stderr.write(`${message}\n`);
}

async function startAttempt(command: StartAttemptCommand): Promise<void> {
  if (active) throw new Error("a Request Attempt is already active");
  const attemptId = randomUUID();
  const abortController = new AbortController();
  active = { id: attemptId, abortController };
  emit({ type: "state_changed", attemptId, state: "planning" });

  const current = await registry.read();
  const utility = current.utilities.find((candidate) => candidate.id === command.utilityId);
  if (!utility) throw new Error(`unknown Utility: ${command.utilityId}`);

  try {
    await runAgentSession({
      cwd: path.join(dataRoot, utility.folder),
      request: command.requestText,
      abortController,
      ...(command.kind === "revision" && utility.session.activeId
        ? { resumeSessionId: utility.session.activeId }
        : {}),
      onInitialized: async (sessionId) => {
        await registry.persistSession(command.utilityId, sessionId);
        emit({
          type: "session_initialized",
          utilityId: command.utilityId,
          sessionId,
        });
      },
    });
    emit({
      type: "stage_result",
      attemptId,
      stage: "agent_session_probe",
      ok: true,
      summary: "Agent SDK session initialized and persisted",
    });
  } catch (error) {
    if (abortController.signal.aborted) {
      emit({
        type: "attempt_interrupted",
        attemptId,
        reason: "Request Attempt cancelled",
        rollback: "No source changes were made",
      });
    } else {
      logError(error);
      emit({
        type: "attempt_failed",
        attemptId,
        reason: "Agent SDK session probe failed",
        rollback: "No source changes were made",
      });
    }
  } finally {
    active = undefined;
  }
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (line.trim().length === 0) continue;
  try {
    const command = decodeHostCommand(line);
    if (command.type === "start_attempt") {
      void startAttempt(command);
    } else if (command.type === "cancel_attempt") {
      if (active?.id === command.attemptId) active.abortController.abort();
    } else {
      throw new Error("clarification answers are unavailable before H1");
    }
  } catch (error) {
    logError(error);
  }
}
