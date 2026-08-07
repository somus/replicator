# Claude Agent SDK session and authentication contract

Research date: 2026-08-08

Verified package: `@anthropic-ai/claude-agent-sdk` 0.3.224

Scope: TypeScript Agent SDK running locally on the prepared demo Mac

## Verdict

The TypeScript Agent SDK supports Replicator's required continuity without keeping a sidecar process alive. Each generation can use a separate `query()` call, Replicator can capture the returned session UUID, and a later process or app launch can pass that UUID as `options.resume`. The transcript is local JSONL state, so this survives process and app restarts on the same Mac but does not move automatically to another machine. Replicator should store the session UUID alongside the project directory and keep the generated source as authoritative project state.

For authentication, use `ANTHROPIC_API_KEY` as Replicator's supported contract. The SDK can technically inherit the developer's existing Claude subscription login, but Anthropic says developers building products with the Agent SDK should use an API key or supported cloud provider and must not offer Claude.ai login or route end-user traffic through consumer-plan credentials. A locally logged-in subscription is useful for personal development, but it should not become the hackathon product's authentication design.

For the one-Mac hackathon build:

- Use the stable `query()` API, not `createSession()`. The experimental V2 TypeScript session API was removed in 0.3.142.
- Start each project with a fresh `query()`, capture `session_id` from the early `system/init` message, and save it again from the final `result` message.
- Resume follow-ups explicitly with `resume: savedSessionId`. Do not use `continue: true`, which selects the most recent session for a directory and becomes ambiguous once Replicator has multiple projects or overlapping runs.
- Leave `persistSession` enabled, which is the default. Do not build a `SessionStore` adapter for a single prepared Mac.
- Pass Replicator's MCP/tool configuration and permission policy on every initial or resumed `query()` call. Session history does not replace current runtime configuration.
- Implement the Cancel button with an `AbortController` supplied in `options.abortController`. Capture the session ID before long-running work begins, and do not treat cancellation as a filesystem rollback.

These conclusions follow the current [session guide](https://code.claude.com/docs/en/agent-sdk/sessions), [TypeScript SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript), [authentication documentation](https://code.claude.com/docs/en/authentication), and [authentication policy](https://code.claude.com/docs/en/legal-and-compliance).

## TypeScript session lifecycle

`query()` is the supported TypeScript entry point. It accepts a string or `AsyncIterable<SDKUserMessage>` prompt and returns a `Query`, which is both an async message generator and a control handle. A first call without `resume` or `continue` creates a new session. The TypeScript SDK exposes the UUID on the initial `system` message with subtype `init`, and every `result` message carries `session_id` whether the result represents success or an SDK-level error. A process failure before initialization can still yield no session ID, so Replicator must handle that case explicitly. See [Work with sessions](https://code.claude.com/docs/en/agent-sdk/sessions#capture-the-session-id) and the [`query()` reference](https://code.claude.com/docs/en/agent-sdk/typescript#query).

The minimal lifecycle is:

```ts
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

type ProjectConversation = {
  cwd: string;
  sessionId?: string;
};

async function runAgent(
  project: ProjectConversation,
  prompt: string,
  abortController: AbortController,
  onMessage: (message: SDKMessage) => void,
): Promise<string> {
  let sessionId = project.sessionId;

  const running = query({
    prompt,
    options: {
      cwd: project.cwd,
      resume: project.sessionId,
      persistSession: true,
      abortController,
      env: { ...process.env },
    },
  });

  for await (const message of running) {
    onMessage(message);

    if (message.type === "system" && message.subtype === "init") {
      sessionId = message.session_id;
    }

    if (message.type === "result") {
      sessionId = message.session_id;
    }
  }

  if (!sessionId) throw new Error("Claude session did not initialize");
  return sessionId;
}
```

The actual implementation should persist the UUID as soon as `system/init` arrives rather than waiting for the promise to finish. This makes an interrupted or failed run recoverable if the SDK has already created the transcript.

`continue: true` and `resume` both add to existing history, but they select it differently. `continue` finds the most recent session associated with the working directory, while `resume` selects one UUID. The two options are mutually exclusive. Explicit IDs are the correct fit for a library of generated Utilities because the project record already gives Replicator a durable place to store the mapping. The current session guide also documents forking with `forkSession: true`, but that branches conversation history rather than files and is unnecessary for the demo. See [Continue, resume, and fork](https://code.claude.com/docs/en/agent-sdk/sessions#continue-resume-and-fork).

The old session-shaped API is not a safe implementation target. Anthropic removed the experimental V2 API, including `createSession()` and its `send`/`stream` pattern, in TypeScript Agent SDK 0.3.142. Current guidance is to use `query()` with an async iterable for a long-lived interactive process or `query()` plus `resume` for calls separated by process restarts. See the note in [TypeScript automatic session management](https://code.claude.com/docs/en/agent-sdk/sessions#typescript-continue-true) and the first-party [TypeScript changelog](https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md).

## What persists across restarts

By default, the SDK writes conversation transcripts under `~/.claude/projects/<encoded-cwd>/*.jsonl`. If `CLAUDE_CONFIG_DIR` is set, the root moves to `$CLAUDE_CONFIG_DIR/projects/`. The transcript contains prompts, model responses, tool calls, and tool results. `resume: sessionId` restores that conversation context after the sidecar or builder app restarts. The current SDK can search other local project directories for the ID if the expected encoded `cwd` directory does not contain it, but keeping the same absolute project directory is still the deterministic path and avoids duplicate-ID ambiguity. See [Resume by ID](https://code.claude.com/docs/en/agent-sdk/sessions#resume-by-id).

Sessions do not snapshot the generated Utility's filesystem. Files already edited remain on disk independently of the transcript, and resuming a conversation does not restore, move, or roll back them. Replicator therefore needs both:

1. The project directory and project metadata as authoritative product state.
2. The Claude session UUID as optional conversational continuity for follow-up prompts.

This split is explicit in the [session guide](https://code.claude.com/docs/en/agent-sdk/sessions), which says sessions persist conversation rather than filesystem state.

`persistSession: false` disables the local transcript and makes later resume impossible. Keep the default `true`. For another machine, an ephemeral container, or a serverless worker, Anthropic provides a `SessionStore` interface whose required `append` and `load` methods mirror local transcript entries to an external backend. The store is dual-write rather than a replacement for local storage, and the TypeScript type currently marks it alpha. This solves a future multi-host deployment problem, not the prepared-Mac demo, so building it now would add failure modes without helping tomorrow's path. See [Persist sessions to external storage](https://code.claude.com/docs/en/agent-sdk/session-storage).

One operational consequence is that deleting only Replicator's project metadata does not delete the corresponding Claude transcript. Retention or deletion of `~/.claude/projects` is separate. That is acceptable for the hackathon but must be specified before a distributable product.

## Tool and MCP integration

The SDK can expose Replicator's constrained editing and validation operations as in-process MCP tools. In TypeScript, define each tool with `tool()`, wrap the group with `createSdkMcpServer()`, pass the server in `options.mcpServers`, and use its fully qualified `mcp__<server>__<tool>` name in `allowedTools`. In-process servers run inside the sidecar rather than as separate executables. See [Give Claude custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools) and [Connect to external tools with MCP](https://code.claude.com/docs/en/agent-sdk/mcp).

Three controls have different meanings and should not be conflated:

- `mcpServers` registers the external or in-process capabilities for this invocation.
- `allowedTools` auto-approves named tools; it does not define the complete set of tools visible to Claude.
- `tools` and `disallowedTools` restrict which built-in tools exist. For a target-scoped agent, Replicator can set `tools: []`, expose only its in-process MCP server, allow only the exact MCP tools, and use a non-interactive permission policy such as `dontAsk` so unapproved calls are denied.

The MCP server definition and permission options belong to each `query()` call. A resumed transcript restores prior calls and their results, but Replicator should reconstruct the same tool surface and current policy for the resumed invocation rather than treating conversation history as configuration. The initial `system/init` message reports MCP server status, including `connected`, `pending`, `failed`, and `needs-auth`, so the sidecar can fail early when a required server is unavailable. See [MCP error handling](https://code.claude.com/docs/en/agent-sdk/mcp#error-handling).

MCP credentials are separate from the credential used to call Claude. Stdio MCP servers receive secrets through their `env` configuration, while HTTP/SSE servers accept headers or OAuth. Replicator's local in-process tools need neither. See [MCP authentication](https://code.claude.com/docs/en/agent-sdk/mcp#authentication).

## Cancellation and interruption

The TypeScript SDK exposes three related mechanisms:

- `Options.abortController` cancels the overall query and cleans up its resources. This works for the simple one-message shape and is the correct primitive for Replicator's Cancel button.
- `Query.close()` forcefully ends the query, pending requests, MCP transports, and the underlying Claude Code subprocess. It is useful for teardown when the owning UI disappears.
- `Query.interrupt()` is a control request available only in streaming-input mode. It interrupts the current turn while retaining a long-lived interactive process and its queued-message semantics.

The differences are documented in the [TypeScript `Query` reference](https://code.claude.com/docs/en/agent-sdk/typescript#query-object) and [Streaming Input guide](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode). Replicator does not need a persistent streaming-input process merely to support follow-ups because explicit session resume already crosses process restarts.

The UI implementation should keep one `AbortController` per active generation and call `abort()` exactly once when the user cancels. It should then wait for the iterator to finish or throw before marking the process stopped. The session UUID should already have been persisted from `system/init` if initialization completed.

Cancellation is not transactional. A tool may have written some project files before cancellation, and the session contract does not roll them back. Replicator should mark the project as interrupted, inspect or validate the current filesystem on the next run, and either resume the saved session or start a fresh repair run. The docs support returning to an interrupted session, but they do not promise that every cancellation point produces a complete final `result` message, so the builder must tolerate having only the ID captured at initialization. See [Sessions and continuity](https://code.claude.com/docs/en/agent-sdk/agent-loop#sessions-and-continuity).

## Authentication contract

The SDK launches the same Claude Code engine and follows Claude Code's credential precedence. For a local sidecar, the relevant order is:

1. Cloud-provider selection, when configured.
2. `ANTHROPIC_AUTH_TOKEN`.
3. `ANTHROPIC_API_KEY` from Claude Console.
4. An `apiKeyHelper`.
5. `CLAUDE_CODE_OAUTH_TOKEN` generated by `claude setup-token`.
6. Stored subscription OAuth credentials from Claude Code login.

Anthropic explicitly says the API-key, bearer-token, and helper paths apply to surfaces wrapping the CLI, including the Agent SDK. An API key therefore overrides a locally logged-in subscription for a non-interactive SDK call. See [Authentication precedence](https://code.claude.com/docs/en/authentication#authentication-precedence).

The technical support for subscription OAuth does not make it the right product contract. Anthropic's published policy says OAuth is for purchasers using Claude Code and native Anthropic applications, while developers building products or services with Claude capabilities should use a Console API key or supported cloud provider. It also forbids offering Claude.ai login or routing requests through Free, Pro, or Max credentials on behalf of users. See [Authentication and credential use](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use) and the [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview#get-started).

For Replicator tomorrow:

- Configure `ANTHROPIC_API_KEY` in the prepared sidecar environment before the demo.
- Do not add a Claude login flow or read, copy, display, or persist Claude Code's stored OAuth credentials.
- Do not put the key into project files, generated app directories, logs, or UI messages.
- If `options.env` is provided, spread `process.env`. The TypeScript SDK says this option replaces the subprocess environment rather than merging it, so passing a narrow object can silently remove `PATH`, `HOME`, and `ANTHROPIC_API_KEY`. See [`Options.env`](https://code.claude.com/docs/en/agent-sdk/typescript#options).
- Fail a startup preflight before the live demo if no supported credential is available. Do not discover that state after a multi-minute generation has begun.

Using the developer's own stored Claude subscription may work for local personal development, and `CLAUDE_CODE_OAUTH_TOKEN` exists for the subscriber's scripts. It should remain an unsupported developer convenience because the boundary between ordinary individual use and a product demo is policy-sensitive. API-key authentication removes that ambiguity and matches the SDK quickstart.

## Implementation consequences for the hackathon plan

The smallest credible architecture is a restartable TypeScript sidecar with no long-lived agent object:

```text
project record
  = project directory
  + Claude session UUID
  + current run status

initial request
  -> query({ cwd, tools, permissions, abortController })
  -> persist system/init.session_id immediately
  -> consume messages through result

follow-up request
  -> query({ cwd, resume: sessionId, same tools and permissions, abortController })
  -> consume messages through result
```

This design proves actual conversation resume across builder and sidecar restarts while keeping source files authoritative. It also permits a fresh-session fallback: if a transcript is missing or resume fails, Replicator can start a new query against the existing project after explicitly telling the user that conversational context was lost.

Pin the SDK version for the hackathon. The TypeScript API has changed quickly enough that a session API was introduced and later removed, and 0.3.224 was published from first-party commit `86e3e9464ea31b62b94de39412d70ff2b8b5f97b`. The inspected npm package declares Node.js 18 or newer. Use the [0.3.224 npm release](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk/v/0.3.224) rather than an unbounded range, and recheck the changelog before upgrading.

## Remaining uncertainty

No live authenticated query was run for this research because doing so would consume credentials and billable or subscription usage. The session, cancellation, MCP, and authentication conclusions were verified against current first-party documentation, the first-party TypeScript repository, and the published 0.3.224 package declarations and runtime bundle.

The docs guarantee resumable conversation history and describe recovering from interruption, but they do not define a transactional checkpoint at every possible forced cancellation point. The product should treat `system/init` as the earliest durable-ID signal, preserve the project filesystem independently, and make resume failure recoverable rather than impossible.

The `SessionStore` API is present and documented but remains marked alpha in the inspected TypeScript declaration. Its external durability path should be reconsidered only if the destination expands beyond one prepared Mac.

## Primary sources

- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [Work with sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- [Persist sessions to external storage](https://code.claude.com/docs/en/agent-sdk/session-storage)
- [TypeScript SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript)
- [Streaming Input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)
- [Give Claude custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools)
- [Connect to external tools with MCP](https://code.claude.com/docs/en/agent-sdk/mcp)
- [Claude Code authentication](https://code.claude.com/docs/en/authentication)
- [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
- [TypeScript SDK repository and changelog](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Published npm package 0.3.224](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk/v/0.3.224)
