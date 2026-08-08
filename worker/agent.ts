import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export type AgentSessionOptions = {
  cwd: string;
  request: string;
  resumeSessionId?: string;
  abortController: AbortController;
  onInitialized: (sessionId: string) => Promise<void>;
};

export async function runAgentSession(options: AgentSessionOptions): Promise<void> {
  const queryOptions = {
    cwd: options.cwd,
    abortController: options.abortController,
    maxTurns: 1,
    persistSession: true,
    permissionMode: "dontAsk" as const,
    tools: [] as string[],
    settingSources: [] as [],
    ...(options.resumeSessionId ? { resume: options.resumeSessionId } : {}),
  };

  let initialized = false;
  for await (const message of query({ prompt: options.request, options: queryOptions })) {
    await persistInitialization(message, initialized, options.onInitialized);
    if (message.type === "system" && message.subtype === "init") initialized = true;
  }

  if (!initialized) throw new Error("Agent SDK ended before session initialization");
}

async function persistInitialization(
  message: SDKMessage,
  alreadyInitialized: boolean,
  onInitialized: (sessionId: string) => Promise<void>,
): Promise<void> {
  if (alreadyInitialized || message.type !== "system" || message.subtype !== "init") return;
  await onInitialized(message.session_id);
}
