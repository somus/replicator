# Replicator Hackathon Implementation Handoff

This is the locked implementation plan for one lead and up to three bounded workers in one focused eight-hour build. The goal is a self-contained macOS arm64 `Replicator.app` that a judge can open from a ZIP without installing development tools or authenticating Claude.

The Submission Floor is fixed. All three Utility Formats must complete Build, behavior verification, packaging, launch, and Revision through the final Agent SDK path. Only rename, soft delete, animation and fine visual tuning, and the optional telemetry analyzer may be cut.

## Product contract

Replicator has a persistent Utility Library and a selected Utility workspace. The workspace shows the Owner Timeline, state, accepted plan, Verification Evidence, launch controls, and an anchored request composer. It supports one globally active Request Attempt; while busy, owners may browse and launch existing Ready Artifacts but may not queue work.

Each Utility owns one Claude Session. Persist its session ID immediately when the Agent SDK initializes it. A Revision Request resumes that session. Source remains authoritative, and session replacement is offered only when resume itself is unavailable. If accepted, replacement starts from a source summary and the current Behavior Contract.

Planning and building happen in the same Claude Session. Claude may ask a maximum of two structured Clarification batches when material ambiguity would change the result. It may not make a material assumption. The host validates and accepts a plan before edits begin, selects and locks the Utility Format, and rejects Behavior Scenarios the selected adapter cannot execute.

Reference Images are optional guidance. Accept at most four PNG, JPEG, or WebP files, each no larger than 5 MB. Normalize each image to at most 2000 px on its longest edge, persist it in the Utility folder, and pass it to the same Claude Session. Do not automatically copy it into the Utility.

## Pinned runtime

Use these exact arm64 components in the Submission Package:

- Node.js 24.18.1 LTS.
- `@anthropic-ai/claude-agent-sdk` 0.3.226.
- Native SDK and CLI 0.8.1.
- Zig 0.16.0.
- TypeScript compiled to JavaScript before assembly. Do not require Bun or `ts-node` at runtime.

Resolve every runtime path relative to `Replicator.app/Contents/Resources`. Generated source, caches, registries, evidence, and Ready Artifacts belong under `~/Library/Application Support/Replicator`. No writable data belongs in the signed app bundle.

## Minimal implementation shape

Keep the code direct. Do not add a repository test suite, dependency injection, migration framework, plugin system, generic task engine, or speculative error recovery.

```text
src/
  app.native              Native builder markup
  core.ts                 builder state, registry views, worker bridge
worker/
  index.ts                NDJSON loop and Request Attempt state machine
  protocol.ts             shared message types and decoding
  registry.ts             atomic registry, backup, Utility folders
  agent.ts                one Agent SDK query/resume path and tools
  targets.ts              format policies, scaffolds, path guards, digests
  verification.ts         Native automation and WebView scenario execution
templates/
  native-bounded/
  native-multimodule/
  react-webview/
resources/
  native-guidance/        small routed SDK references only
scripts/
  assemble-release.sh     toolchain copy, build, ad-hoc signing, ZIP, hashes
  seed-prepared-demo.sh   copy verified prepared data into a clean data root
README-JUDGES.md           exact Finder open and demo instructions
```

Files may be combined when that is faster, but ownership boundaries must remain non-overlapping until integration.

### Host-worker protocol

Use newline-delimited JSON on stdin and stdout. Validate every incoming object and emit one JSON object per line. Logs go to stderr with credentials and absolute machine paths redacted.

Host commands:

- `start_attempt`: Utility ID, request ID, Build or Revision kind, request text, normalized Reference Image metadata, current source digest, and Ready Artifact metadata.
- `answer_clarification`: attempt ID, batch ID, and structured answers.
- `cancel_attempt`: attempt ID.

Worker events:

- `session_initialized`: persist the Utility's session ID before acknowledging any later event.
- `state_changed`: planning, awaiting_clarification, building, verifying, preparing, ready, failed, or interrupted.
- `clarification_required`: one structured batch with stable question IDs and bounded options or short answers.
- `plan_accepted`: concise plan, locked Utility Format, and executable Behavior Contract.
- `stage_result`: bounded validation, repair, verification, or packaging outcome without private Claude activity.
- `artifact_ready`: relative artifact path, source digest, binary digest, screenshots, and scenario results.
- `attempt_failed` or `attempt_interrupted`: bounded owner-facing reason and rollback result.

The worker process remains alive while awaiting a Clarification. Clarification wait time does not count toward the active Request Attempt deadline. The builder sends `cancel_attempt`, closes stdin after the terminal event, and treats an unexpected worker exit as failed or interrupted according to whether cancellation was active.

### Registry and folder contract

Use one versioned `registry.json`, write through a temporary file, rename atomically, and retain one last-known-good backup. Store only relative paths. One Utility folder contains current source, immutable accepted Reference Images, the current Ready Artifact, a failed or interrupted working tree when applicable, bounded evidence, and snapshots needed for Revision rollback.

Each Utility record contains:

```ts
type UtilityRecord = {
  id: string;
  displayName: string;
  format: "native-bounded" | "native-multimodule" | "react-webview";
  state: "planning" | "awaiting_clarification" | "building" |
    "verifying" | "preparing" | "ready" | "failed" | "interrupted";
  folder: string;
  timeline: OwnerTimelineEntry[];
  session: { activeId: string; replacedIds: string[] };
  references: ReferenceImageRecord[];
  acceptedPlan?: AcceptedPlan;
  behaviorContract?: BehaviorContract;
  readyArtifact?: ReadyArtifactRecord;
  activeAttempt?: ActiveAttemptRecord;
  lastError?: OwnerFacingError;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};
```

Persist Owner Timeline entries for Build Requests, Revision Requests, and Clarification questions and answers. Do not persist the Agent SDK transcript, hidden reasoning, full edit payloads, secrets, or unbounded tool output.

### Generation and recovery

Every Request Attempt uses the same host-enforced state machine:

1. Plan in the Utility's Claude Session and resolve Clarifications.
2. Validate and lock the Utility Format and a Behavior Contract of at most three scenarios.
3. Allow edits only within the selected format policy.
4. Run format validation and repair while more than 80 seconds remain.
5. Reserve the final 80 seconds for verification, release build, digest binding, and preparation.
6. Mark ready only when the final source digest matches all evidence and the standalone `.app` launches.

The active deadline is 360 seconds. A Behavior Contract pass has a 45-second limit. Cancellation uses `AbortController`, waits three seconds, then kills the worker process group and records `interrupted`. An interrupted or failed initial Build retains partial source for retry. A failed Revision restores the persisted pre-revision snapshot and leaves the previous Ready Artifact launchable.

## Utility Format adapters

### Bounded Native

Claude may edit only `app.zon`, `src/app.native`, and `src/core.ts`. Reject symlinks, traversal, hidden files, generated output, and edits after verification begins. Validate with Native check and a Debug automation build, run Native automation scenarios, then create a ReleaseFast standalone app.

### Multi-module Native

Use the same policy and pipeline, plus at most seven additional top-level `src/*.ts` files. Do not permit nested source, third-party dependencies, scripts, or arbitrary commands.

### React/WebView

Claude may edit only the frontend entry and frontend `src` files. The Zig shell, package configuration, build scripts, dependency policy, and verification harness are protected. Permit exact-version public npm dependencies only, with no lifecycle scripts or native add-ons.

Inject a protected in-app DOM harness into the production frontend. It reads host-supplied scenario JSON, performs bounded selector, click, input, focus, and assertion steps inside the actual WKWebView, and returns structured results through a minimal protected shell bridge. Native automation separately proves the shell launches, resizes, remains dispatch-error-free, and produces final screenshots. Source-string inspection or shell smoke alone cannot satisfy Ready.

## Behavior Contract

For an initial Build, choose the primary owner journey and up to two highest-risk requested behaviors. For a Revision, rerun the original primary journey, the newest requested change, and the highest-risk preserved behavior. Replace the original primary only when the Revision explicitly supersedes it.

All formats also enforce a small usability baseline: the app launches, the primary controls are visible and accessible, keyboard focus is usable, content survives the supported window size, and there are no dispatch or runtime errors. External effects such as file export are proven at the app-owned boundary without granting broad filesystem or network access.

Replicator, not Claude, captures digest-bound scenario results and final screenshots. There is no manual, source-inspection, or smoke-only Ready bypass.

## Eight-hour execution order

### H0:00 to H1:00, prove the package first

The lead creates short-lived worktrees, fixes the protocol and registry shapes above, pins runtime versions, and prevents overlapping file ownership.

In parallel:

- Packaging owner assembles a tiny ad-hoc signed outer app with relative bundled Node, Native, and Zig paths. It must spawn an echo worker, build a minimal Utility into Application Support, package it, and launch it. Retain commands, architectures, paths, durations, and screenshots.
- Adapter owner creates the three protected templates, path policies, digest functions, Native validation path, and the first WebView harness slice.
- UI owner implements the approved split builder against fixed protocol fixtures: Utility Library, Owner Timeline, state treatments, anchored composer, Reference Images, evidence, launch, Revision, and one-global-request disabling.
- Lead implements compiled worker startup, NDJSON decoding, atomic registry creation, immediate Agent SDK session persistence, and the single query/resume path.

H1 gate: the packaged toolchain probe must pass. If it fails, the packaging owner stays on it. If it is still failing at H2, all owners stop feature work and join the packaging critical path because no valid submission is possible without it.

### H1:00 to H3:30, finish the bounded Native vertical slice

The lead wires planning, one real Clarification path, accepted plan persistence, scoped edit tools, timeout and cancellation, Revision resume, snapshots, rollback, and evidence events. The adapter owner completes Native automation, digest binding, ReleaseFast assembly, and launch. The UI owner replaces fixtures with real events and registry state.

H3:30 gate: the exact Focus Sprint Build and Revision must each reach a behavior-verified, packaged, launchable Ready Artifact through the Agent SDK path, with the same Claude Session resumed after a builder restart.

### H3:30 to H5:00, complete every format

Add multi-module Native and React/WebView without adding a second orchestration path. Complete the protected WebView DOM harness and its shell bridge. Execute the controlled CSV Inspector and Color Palette Organizer Build and Revision pairs.

H5 gate: each Utility Format has completed Build and Revision through verification, packaging, launch, persistence, and evidence capture.

### H5:00 to H6:00, integrate the submission flow

Complete Reference Image normalization, the approved UI states, Prepared Demo seeding, bounded telemetry, restart recovery, browse-and-launch-only credential expiry, and judge-facing failure messages. Exercise cancel and failed-Revision recovery.

H6 gate: feature freeze. If any Submission Floor item is incomplete, cut rename, soft delete, animation and fine styling, and the optional telemetry analyzer in that order. Do not cut a Utility Format, Session resume, Behavior Contract enforcement, standalone packaging, Prepared Demo, or recovery proof.

### H6:00 to H7:00, assemble and accept on the build account

Assemble the immutable toolchain and clean application resources, compile the worker, build the outer app, sign nested executables and app bundles bottom-up with ad-hoc identity, and create the ZIP with resource forks preserved. Generate the judge README and seed only the clearly labelled Prepared Demo.

Run all six controlled format Acceptance Runs against this assembled package using a separate acceptance registry. Run one Clarification interaction, cancellation, failed Revision rollback, restart persistence, invalid-key degradation, evidence redaction, and secret scanning. Create the accelerated and full-speed demo captures.

### H7:00 to H8:00, fresh-account acceptance and release

Create a dedicated limited Anthropic workspace key with a one-day lifetime or scheduled deletion, inject it only through the packaging environment, rebuild and re-sign, then remove it from the environment and shell history. The key is a hard submission blocker.

On a fresh macOS account with quarantine preserved, no global development tools, and no local Claude login, follow only `README-JUDGES.md`. Control-click Open once, inspect and launch Prepared Demo, then complete the exact Focus Sprint Build and Revision. Restart Replicator between them to prove persistence and Session resume.

If the Submission Floor passes, compute hashes, create a GitHub Release tagged `v0.1.0-hackathon`, upload `Replicator.zip`, checksums, the judge README, and sanitized evidence, then link that release from the submission. If it does not pass by H8, continue only on the critical path and do not upload a narrower or misleading product.

## Ownership and integration

The lead owns requirements, protocol, registry, Agent SDK integration, state machine, merge order, and final verification. Three workers may operate concurrently:

- Packaging owner: `scripts/assemble-release.sh`, packaged toolchain layout, signing, ZIP, README, hashes, and package probes.
- Adapter owner: `worker/targets.ts`, `worker/verification.ts`, protected templates, scaffolds, digests, validation, Behavior Scenario execution, and the WebView bridge.
- UI owner: `src/app.native`, `src/core.ts`, icon integration, and all approved builder states.

Use separate worktrees, short commits, and non-overlapping files. The lead fixes shared types before parallel work, reviews every merge, and owns any cross-boundary edit. No worker redesigns the product contract or silently cuts scope.

## Controlled Acceptance Runs

Use a separate acceptance registry and retain bounded evidence. Only the Focus Sprint Prepared Demo is seeded into the Submission Package.

### Bounded Native: Focus Sprint

Build Request:

> Build a native Focus Sprint timer for macOS. Include 25-minute Focus, 5-minute Break, and 10-second Demo presets; show remaining time and current mode; provide Start, Pause, and Reset; and count completed focus sprints. Use the attached Reference Image for the dark appearance, hierarchy, density, and calm visual direction.

Revision Request:

> Add a configurable daily goal, defaulting to four focus sprints, with a clear circular progress indicator and a subtle celebration when the goal is reached. Preserve every timer preset, control, and completed-sprint behavior.

### Multi-module Native: CSV Inspector

Build Request:

> Build a native CSV Inspector for macOS. Let me paste CSV text, analyze it, and show the row count, duplicate row count, and cells with missing values. Include a Reset action. Keep parsing, analysis, and interface responsibilities clearly separated so the Utility remains easy to revise.

Revision Request:

> Add a filter that shows only rows with duplicates or missing cells, and let me export the current analysis summary to a local text file. Preserve CSV input, row-count, duplicate-count, missing-cell, and Reset behavior.

The accepted plan must route this Utility to multi-module Native. A different format fails this controlled run rather than authorizing a manual override.

### React/WebView: Color Palette Organizer

Build Request:

> Build a responsive Color Palette Organizer for macOS with a visual swatch grid. Let me add, edit, delete, and filter named colors using hexadecimal values.

Revision Request:

> Add a contrast preview for any two saved colors and a control that sorts the palette by luminance. Preserve adding, editing, deleting, filtering, naming, and hexadecimal validation.

The accepted plan must route this Utility to React/WebView. A different format fails this controlled run rather than authorizing a manual override.

### Clarification and recovery

Submit `Build a native daily tracker for me.` Confirm that Replicator asks one structured Clarification batch before accepting a plan, answer every material question, inspect the updated accepted plan, then cancel before generation. Retain the Owner Timeline and interrupted state.

Separately cancel one active initial Build and prove it becomes interrupted with partial source retained. Force one Revision validation failure using an acceptance-only damaged toolchain copy, not a product code hook, and prove the previous Ready Artifact remains unchanged and launchable.

## Prepared Demo and judging path

The exact judging story is the Focus Sprint Build and Revision above with the approved dark Reference Image. The hard demo length is three minutes.

Default to the Prepared Demo unless the final package completes three consecutive fresh Focus Sprint workspaces, each behavior-verified Ready within 1:30 with warm bundled tools and caches. In a qualified live run, switch to the Prepared Demo at 1:45 if Ready has not arrived.

Prepared path target: 2:12. Qualified live path target: 2:35. Cutoff fallback target: 2:55. If the live gate fails, say exactly:

> This exact flow didn't meet our live time gate today, so I'm showing a prepared run with its real verification evidence.

Keep a continuous no-cut full-run recording and a 45-second uniformly accelerated version that persistently shows source duration, playback speed, and wall-clock time. Never represent Prepared Demo or accelerated footage as a current live Request Attempt.

## Submission Floor

Every item below must pass before release:

- `Replicator.zip` opens on a quarantined fresh arm64 macOS account using only the README's Control-click Open step.
- The app uses no global Node, Native, Zig, Bun, Claude login, or developer checkout.
- The one-day key authenticates a real Agent SDK Build and Revision, and invalid or expired access becomes browse-and-launch-only.
- One Utility Session persists immediately, survives restart, and resumes for Revision.
- One global Request Attempt, structured Clarification, Reference Images, cancellation, retry, and unconditional failed-Revision rollback behave as specified.
- All three Utility Formats pass their exact Build and Revision Acceptance Runs through the final package.
- Every Ready Artifact has an immutable format, accepted plan, digest-matched Behavior Contract results, usability result, screenshots, standalone `.app`, and successful launch.
- Prepared Demo is present, clearly labelled, behavior-verified, launchable, and backed by its real Owner Timeline and evidence.
- Registry and Ready Artifacts survive a builder restart. Previous Ready remains launchable during work and after a failed Revision.
- The final ZIP contains only required runtime and demo resources. It contains no source checkout, caches, acceptance registry, private transcript, secrets outside the intended embedded key, machine-specific absolute paths, or development artifacts.
- Sanitized evidence includes package SHA-256, component versions and architectures, command summary, six format Acceptance Runs, Clarification and recovery results, fresh-account Focus Sprint results, screenshots, digests, and both demo recordings.

## Release artifacts

Publish these GitHub Release assets:

- `Replicator.zip`
- `SHA256SUMS.txt`
- `README-JUDGES.md`
- `replicator-acceptance-evidence.zip`

The evidence archive must use repository-relative or package-relative paths, redact JSONL fields that could contain owner text or credentials, and omit private Agent SDK activity. Run literal scans for the Anthropic key, home directory, checkout path, temporary directories, and common credential field names before upload.

## Decision record

The complete decision history is anchored in the [Wayfinder map](https://github.com/somus/replicator/issues/1). The implementation must follow its resolved tickets for the baseline, Agent SDK contract, credential feasibility, reuse boundary, runtime lifecycle, format routing, persistence, generation and recovery, behavioral verification, builder design, packaging, judging flow, and Utility design guidance.

The approved builder design spec is on [`somus/builder-design-prototype`](https://github.com/somus/replicator/blob/somus/builder-design-prototype/design-prototype/builder-design-spec.md). The approved judging walkthrough and Focus Sprint reference are on [`somus/judging-demo-prototype`](https://github.com/somus/replicator/tree/somus/judging-demo-prototype/demo-prototype).
