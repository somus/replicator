# Replicator Hackathon Implementation Handoff

This is the locked implementation plan for one lead and up to three bounded workers in one focused eight-hour build. The goal is a self-contained macOS arm64 `Replicator.app` that a judge can open from a ZIP without installing development tools or authenticating Claude.

The Submission Floor is fixed. All three Utility Formats must complete Build, behavior verification, packaging, launch, and Revision through the final Agent SDK path. Only rename, soft delete, animation and fine visual tuning, and the optional telemetry analyzer may be cut.

## Product contract

Replicator has a persistent Utility Library and a selected Utility workspace. The workspace shows the Owner Timeline, state, accepted plan, Verification Evidence, launch controls, and an anchored request composer. It supports one globally active Request Attempt; while busy, owners may browse and launch existing Ready Artifacts but may not queue work.

Each Utility owns one Claude Session. Persist its session ID immediately when the Agent SDK initializes it. A Revision Request resumes that session. Source remains authoritative, and session replacement is offered only when resume itself is unavailable. If accepted, replacement starts from a source summary and the current Behavior Contract.

Planning and building happen in the same Claude Session. Claude may ask a maximum of two structured Clarification batches when material ambiguity would change the result. It may not make a material assumption. The host validates and accepts a plan before edits begin, selects and locks the Utility Format, and rejects Behavior Scenarios the selected adapter cannot execute.

Reference Images are optional guidance. Accept at most four PNG, JPEG, or WebP files, each no larger than 5 MB. Normalize each image to at most 2000 px on its longest edge, persist it in the Utility folder, and pass it to the same Claude Session. Do not automatically copy it into the Utility.

When the builder displays a Reference Image, derive and persist a separate Native-compatible thumbnail. The TypeScript runtime accepts at most 16 registered images, 1.25 MiB of encoded input per image, and 1 MiB of decoded RGBA per image, so the retained 2000 px source is not itself a valid UI-display contract.

## Pinned runtime

Use these exact arm64 components in the Submission Package:

- Node.js 24.18.1 LTS.
- `@anthropic-ai/claude-agent-sdk` 0.3.226.
- Native SDK and CLI 0.8.1.
- Zig 0.16.0.
- TypeScript compiled to JavaScript before assembly. Do not require Bun or `ts-node` at runtime.

Resolve every runtime path relative to `Replicator.app/Contents/Resources`. Generated source, caches, registries, evidence, and Ready Artifacts belong under `~/Library/Application Support/Replicator`. No writable data belongs in the signed app bundle.

Bundle the complete `@native-sdk/cli@0.8.1` npm payload and its matching `@native-sdk/cli-darwin-arm64` optional dependency, not a loose executable or a separately chosen SDK checkout. Invoke its wrapper with bundled Node, set `NATIVE_SDK_ZIG` to the bundle-relative Zig 0.16.0 executable, and set `NATIVE_SDK_HOME` to a writable directory below Replicator's Application Support root. This keeps the CLI and SDK version matched, works offline, and prevents use of the judge's global tools or `~/.native` state.

### Native SDK owns the app lifecycle

Use the bundled Native 0.8.1 CLI as the source of truth for scaffolding, development, checking, testing, building, automation, asset bundling, diagnosis, and packaging. Do not add scripts that reproduce those commands, hand-write an app bundle or `Info.plist`, manage a WebView frontend server, poll automation with sleeps or `grep`, or invoke globally installed Native or Zig tools.

Run Native commands with the bundled Node and Native CLI. Record `native version`, including its automation protocol, in release evidence. After `native init`, execute the remaining commands from the Utility root unless they explicitly accept a directory argument. The canonical commands are:

```bash
native init <dir> --template ts-core --frontend native
native init <dir> --frontend react
native dev --yes -Dautomation=true
native dev --core --script <messages.ndjson> --watch
native markup check src/app.native --strict
native test --yes
native check --strict
native automate wait
native automate assert --timeout-ms 45000 '<pattern>'
native build --yes -Dautomation=true
native validate app.zon
native doctor --manifest app.zon --strict
# React/WebView production assets only
native bundle-assets
native package --target macos --signing adhoc
```

`native dev` builds and runs the real Debug app with markup hot reload. For React/WebView it also starts, waits for, and stops the configured frontend dev server and supplies the development URL. `native dev --core` is an optional fast TypeScript-core logic loop without a renderer; it does not replace the real app, automation, or release checks.

`native test` is a required Native tooling step after any `Model` or `Msg` shape change because it refreshes `zig-out/model-contract.zon`; then run `native check --strict` so binding and message-tag checks use the current contract. This does not require adding a repository test suite. Keep zero-configuration Native apps on `app.zon`, `src/core.ts`, and `src/app.native`; do not add `build.zig`, eject the build graph, or create a custom development command unless a verified Native limitation requires it.

Treat command exit status as success or failure and retain only bounded stdout and stderr as evidence. Do not infer success by parsing compiler prose.

Before an agent edits Native code, materialize version-matched guidance from the bundled CLI instead of relying on model memory or a copied documentation corpus:

```bash
native skills get native-ui
native skills get ts-core
native skills get automation
native skills get core --full
native skills get zig
```

Route only the relevant output into the agent context: `native-ui` and `ts-core` for the outer builder and Native Utilities, `automation` for verification, `core --full` for runtime, WebView, and packaging work, and `zig` only for protected Zig shells or a proven host seam. Prefer Native effects such as `Cmd.spawn`, `Cmd.cancel`, `Cmd.readFile`, `Cmd.writeFile`, `Cmd.fetch`, clipboard, timers, and platform dialogs over shell scripts or OS-specific substitutes, but verify that a feature is exposed to the selected TypeScript, Zig, or WebView surface before using it.

## Minimal implementation shape

Keep the code direct. Do not add a repository test suite, dependency injection, migration framework, plugin system, generic task engine, or speculative error recovery.

```text
app.zon                   outer app identity, window, theme, assets, shortcuts
src/
  app.native              Native builder markup
  core.ts                 builder state, registry views, worker bridge
host/
  launcher.swift          bundle paths, Native UI launch, Finder-safe environment
  reference-picker.swift  bounded macOS Reference Image picker helper
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
  native-skills/          version-matched output from the bundled Native CLI
scripts/
  assemble-release.sh     stage resources, Native package, ditto ZIP, hashes
  seed-prepared-demo.sh   copy verified prepared data into a clean data root
README-JUDGES.md           exact Finder open and demo instructions
```

Files may be combined when that is faster, but ownership boundaries must remain non-overlapping until integration.

### Outer Replicator app uses Native built-ins

The approved builder remains a native-rendered TypeScript-core app. Implement its interaction structure with Native markup components and runtime effects before creating any custom widget, process wrapper, input reducer, focus system, menu, animation, or persistence hook.

| Builder requirement | Native SDK implementation |
| --- | --- |
| Utility Library and workspace | Use a controlled `<split>` with pane `min-width` values, not a fixed row plus a hand-built divider. Render a bounded page through `<list>` and keyed `<list-item>` rows with `selected`, so native scrolling, keyboard focus, and accessible selection are automatic. `virtualized` may reduce fixed-row layout work but does not authorize an unbounded TypeScript model or mounted tree. |
| Utility actions | Put Rename, Soft Delete, Restore, and other row actions in one direct-child `<context-menu>` so macOS presents a real `NSMenu`. Use one model-owned anchored `<dropdown-menu on-dismiss>` for the selected Utility's visible More button; do not create custom popup geometry or outside-click handling. |
| Owner Timeline | Use `<timeline>` and keyed `<timeline-item>` entries for persisted owner-visible events. Keep the rendered window bounded so the complete view remains below Native's 1024-widget and 64 KiB retained-text budgets; registry history may remain complete on disk. |
| Plan and evidence detail | Use `<markdown source="{planMarkdown}">` for bounded plan or diagnostic prose and read-only `<code source="{evidenceSource}">` for source or command excerpts. Do not build a Markdown parser, syntax highlighter, line-number gutter, or selectable-text layer. |
| Attempt progress | Use `<stepper active="{stageIndex}">`, `<progress>`, and `<spinner>` for planning, building, verification, and preparation. Use `<alert>` for failed or interrupted outcomes instead of styling generic panels as status components. |
| Clarification | Use `<radio-group>` or a controlled `<toggle-group>` for mutually exclusive options, ordinary text fields for short answers, and a real disabled Continue button until every required answer is present. Do not implement selection behavior with unrelated buttons. |
| Request composer | Use one `<input-group>` containing the `<textarea>` and `<input-group-actions>`. Bind `on-input` through `applyTextInputEvent`, use the textarea's built-in primary+Enter `on-submit`, and swap Send/Cancel controls from model state. Do not create a second text editor, key listener, or composer border/focus ring. |
| Reference Images | Show derived thumbnails with `<image>` or `<avatar>` and load them with `Cmd.imageLoad`. Keep image ID `0` and render a labelled fallback until the terminal state is `loaded`; cancel with `Cmd.imageCancel` and release removed or evicted slots with `Cmd.imageUnregister`. Never decode image formats or maintain a second GPU image cache. Keep at most four visible reference slots within Native's 16-image registry. |
| Modal UI | Use conditional `<dialog>`, `<sheet>`, or `<drawer>` with `on-dismiss` for confirmation or focused tasks. Escape, outside-click dismissal, focus trapping, and modal hit testing belong to the runtime. |
| Icons and appearance | Use Native's compile-checked icon names and semantic controls, not punctuation or hand-drawn glyphs for More, warning, remove, launch, or status actions. Give icon-only buttons an accessible `label` and an anchored `<tooltip>`; the runtime owns hover delay, focus reveal, Escape, and dismissal. Use theme tokens only. The stock theme already follows system light/dark, high-contrast, and reduced-motion settings. |

Put the outer app's identity, version, icon, standard titlebar, stable `main` window label, 1440x1024 target size, 880x680 minimum size, `restore_state = true`, visible-screen clamp restoration, permissions, New Utility and Quit menu commands, shortcuts, fixed boot images, and all-native WebView-layer exclusion in the root `app.zon`; map those command IDs through `commandMsg` and do not persist window geometry yourself. The UI owner owns this file, and the packaging owner may change only package asset paths through a reviewed integration edit. Let macOS-backed `<scroll>` regions provide momentum and overlay scrollbars. Use stable keys for repeated rows and timeline entries so focus, selection, caret, and scroll state do not move when conditional content changes.

Use the Geist theme pack with mint accent `#69E6BA`. Author and judge the approved dark target on a macOS dark-appearance account, while keeping the automatic light and high-contrast variants readable. The generated TypeScript runner follows system appearance and reduced-motion settings; do not add a fixed-palette Zig token layer during the hackathon.

Editable controls already provide caret movement, selection, IME, Cut, Copy, Paste, Select All, and standard text context menus. Static `<text>` is selectable and copyable. Use `Cmd.clipboardRead` or `Cmd.clipboardWrite` only for explicit product actions such as copying a digest; never spawn `pbcopy` or `pbpaste`. Use the runtime's Tab order, control keymaps, Escape dismissal, and focus scopes. Add `keyMsg` only for an approved app-level fallback, and route declared application-menu or shortcut commands through `commandMsg` instead of installing key monitors.

The TypeScript core owns deterministic UI state only. Receive resource, data, and picker paths through `envMsgs`, use `Cmd.spawn` and `Cmd.cancel` for the worker, `Cmd.writeFile` for bounded command envelopes, `Cmd.delay` for a real one-shot debounce, and `Sub.timer` only for a recurring model-derived timer. Launch a Ready Artifact with an explicit `Cmd.spawn` of `/usr/bin/open` and the verified `.app` path; do not add a wrapper script merely to call `open`. Use `Cmd.quitApp` for an explicit quit action. Use `Cmd.now` only for an epoch value; the worker should return bounded display-ready Timeline timestamps. Never use `frameMsg` as a timer or polling loop. `Cmd.persist()` has no shipping host implementation, so the Node worker remains the owner of atomic registry persistence and backups.

Native's open-file dialog is not exposed by the zero-configuration TypeScript-core command set; its built-in dialog API is available through the WebView bridge and Zig platform services, and an unbound `Cmd.request` rejects. For hackathon speed, use one protected arm64 Swift helper at `host/reference-picker.swift` that presents `NSOpenPanel` for PNG, JPEG, and WebP selection. It emits at most four `selected` NDJSON lines plus one terminal line, with every line strictly below 3 KiB; overlong paths produce a bounded error instead of truncation. Launch it through `Cmd.spawn` with the bundle-relative path delivered by `envMsgs`, cancel it through the same stable spawn lifecycle, and treat dismissal as a non-error empty selection. This is the one explicit platform-UI exception; do not add a hidden WebView, `osascript`, a shell wrapper, or a general host RPC layer. Keep validation, normalization, copying, and registry mutation in the Node worker after the helper returns selected paths.

The packaging owner owns `host/launcher.swift`. Native packages that launcher as the bundle executable and stages the built Native UI executable, picker helper, Node, Agent SDK, Native CLI, Zig, worker, and immutable resources under declared assets before signing. On Finder launch, the launcher resolves `Bundle.main.resourceURL` plus `~/Library/Application Support/Replicator`, creates and changes to the data root, sets `REPLICATOR_RESOURCES_ROOT`, `REPLICATOR_DATA_ROOT`, and `REPLICATOR_PICKER_PATH`, then replaces itself with the staged Native UI executable. It performs no registry, worker, update, or UI logic. This makes the existing `envMsgs` and automation working-directory contracts concrete without depending on Finder's current directory.

Do not add an in-window Settings button for the hackathon build. Settings are outside the Submission Floor, and Native's standard settings-window path requires model-declared Zig window wiring plus an application-menu command and primary+comma shortcut. Cut it instead of shipping a dead control or a custom imitation.

Verify the outer builder through its built-in accessibility snapshot rather than pixel coordinates: select a Utility through its labelled `list-item`, resize the split through its separator, submit the composer through `on-submit`, invoke a row context-menu action, answer a Clarification, cancel an attempt, and assert timeline, stepper, alert, disabled, focus, and `dispatch_errors=0` state. Exercise the 1440x1024 target and 880x680 minimum sizes, restart once to prove window restoration, and require headroom below the 1024-node, 64 KiB text, 512-context-item, 16-image, and 16-anchored-surface limits. Use `native automate screenshot` for the outer builder because it is a retained-canvas view.

### Host-worker protocol

Use one command file per worker invocation and newline-delimited JSON on stdout. The builder writes a validated command envelope under Application Support with `Cmd.writeFile`, then starts the bundled Node worker with that relative command-file path in argv. Validate every incoming object and emit one JSON object per line. Logs go to stderr with credentials and absolute machine paths redacted.

This transport is constrained by the TypeScript core API: `Cmd.spawn` stdin is one-shot and limited to 4 KiB, argv is limited to 16 values and 2 KiB, and each streamed stdout line is limited to 4 KiB. Keep command files below the 1 MiB `Cmd.writeFile` limit, argv short, and every NDJSON event below 3 KiB. Write larger plans, diagnostics, and evidence to bounded files and emit only a relative path, digest, and summary. Start the worker with a stable spawn key and use `Cmd.cancel` for cancellation; do not implement a second process manager.

Host commands:

- `load_registry`: data root, optional selected Utility ID, bounded Library and Timeline limits, and optional page cursors. Invoke only after all required `envMsgs` values arrive. The worker emits bounded, view-ready records rather than raw registry JSON; `on-reach-end` requests another page when needed.
- `start_attempt`: Utility ID, request ID, Build or Revision kind, request text, normalized Reference Image metadata, current source digest, and Ready Artifact metadata.
- `answer_clarification`: attempt ID, batch ID, and structured answers.
- `cancel_attempt`: attempt ID.

Worker events:

- `library_item`, `timeline_item`, and `registry_loaded`: bounded records emitted during `load_registry`; the terminal event selects the current Utility and carries no unbounded collection.
- `session_initialized`: persist the Utility's session ID before acknowledging any later event.
- `state_changed`: planning, awaiting_clarification, building, verifying, preparing, ready, failed, or interrupted.
- `clarification_required`: one structured batch with stable question IDs and bounded options or short answers.
- `plan_accepted`: concise plan, locked Utility Format, and executable Behavior Contract.
- `stage_result`: bounded validation, repair, verification, or packaging outcome without private Claude activity.
- `artifact_ready`: relative artifact path, source digest, binary digest, screenshots, and scenario results.
- `attempt_failed` or `attempt_interrupted`: bounded owner-facing reason and rollback result.

The TypeScript subset has no `JSON.parse`. Keep one strict, schema-specific decoder for these bounded NDJSON lines; reject unknown kinds, missing fields, malformed escapes, and over-bound text. Do not copy the registry into the UI model, write a generic JSON parser, or let the worker emit nested or unbounded event payloads.

When a Clarification is needed, the worker persists the Agent SDK session and attempt state, emits `clarification_required`, and exits cleanly. The builder writes `answer_clarification` to a new command file and starts a new worker invocation that resumes the same Claude Session. Clarification wait time does not count toward the active Request Attempt deadline. An unexpected exit is failed or interrupted according to whether `Cmd.cancel` was active.

The package launcher resolves `Replicator.app/Contents/Resources`, `~/Library/Application Support/Replicator`, and the packaged picker path once and delivers them to the TypeScript core through `envMsgs` as `REPLICATOR_RESOURCES_ROOT`, `REPLICATOR_DATA_ROOT`, and `REPLICATOR_PICKER_PATH`. The TypeScript core must not inspect process environment variables or assume the current working directory.

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
3. Create the working tree from an immutable scaffold produced and verified with the exact bundled `native init` version. Do not invent a scaffold or build graph.
4. Allow edits only within the selected format policy.
5. After `Model` or `Msg` changes, run `native test`; then run `native check --strict` and repair while more than 80 seconds remain.
6. Build the ReleaseFast target with `native build --yes -Dautomation=true`, run the Behavior Contract against that binary with `native automate`, and reject dispatch or runtime errors.
7. Reserve the final 80 seconds for verification, digest binding, `native package --target macos --signing adhoc` of the verified binary, and launch.
8. Mark ready only when the final source digest matches all evidence and the standalone `.app` launches.

The active deadline is 360 seconds. A Behavior Contract pass has a 45-second limit. Cancellation calls `Cmd.cancel` on the stable worker key, which kills and reaps the child process group, and records `interrupted` after the spawn stream reports `cancelled`. Do not layer an unproven graceful-signal timeout over this built-in lifecycle. An interrupted or failed initial Build retains partial source for retry. A failed Revision restores the persisted pre-revision snapshot and leaves the previous Ready Artifact launchable.

## Utility Format adapters

### Bounded Native

Claude may edit only `app.zon`, `src/app.native`, and `src/core.ts`. Reject symlinks, traversal, hidden files, generated output, and edits after verification begins. Keep the zero-configuration scaffold and do not add `build.zig`. After model-shape changes run `native test`, then `native check --strict`, build the ReleaseFast target with automation enabled, run Native automation scenarios against that exact binary, and create the standalone app with `native package --target macos --signing adhoc`.

### Multi-module Native

Use the same policy and pipeline, plus at most seven additional top-level `src/*.ts` files. Do not permit nested source, third-party dependencies, scripts, or arbitrary commands.

### React/WebView

Claude may edit only the frontend entry and frontend `src` files. The Zig shell, package configuration, build scripts, dependency policy, and verification harness are protected. Permit exact-version public npm dependencies only, with no lifecycle scripts or native add-ons.

Create the protected shell from `native init --frontend react`, keep its generated Zig shell, build graph, package configuration, production asset flow, and frontend lifecycle under Native ownership, and do not add a second Vite server manager. Use the manifest-configured frontend build and `native bundle-assets` path for production assets. Inject a protected in-app DOM harness into the production frontend. It reads host-supplied scenario JSON, performs bounded selector, click, input, focus, and assertion steps inside the actual WKWebView, and returns structured results through one exact-origin bridge command. Allow only the required command and `zero://app` origin in `app.zon`; do not use wildcard origins. Keep each bridge response within Native's 16 KiB response limit and each handler result within 12 KiB. Native automation separately proves the shell launches, reaches `ready=true`, exposes expected WebView metadata and accessibility state, resizes, focuses, and remains dispatch-error-free. Source-string inspection or shell smoke alone cannot satisfy Ready.

`native automate screenshot` captures only retained-canvas or `gpu_surface` content; it does not capture WKWebView DOM or pixels. Use it for the Native formats. For React/WebView, retain the protected DOM harness for behavior and use a separately verified full-window capture path for visual evidence. If macOS `screencapture` is used, verify the target window identity and nonblank output because Screen Recording permission failures can otherwise produce misleading captures.

## Behavior Contract

For an initial Build, choose the primary owner journey and up to two highest-risk requested behaviors. For a Revision, rerun the original primary journey, the newest requested change, and the highest-risk preserved behavior. Replace the original primary only when the Revision explicitly supersedes it.

All formats also enforce a small usability baseline: the app launches, the primary controls are visible and accessible, keyboard focus is usable, content survives the supported window size, and there are no dispatch or runtime errors. External effects such as file export are proven at the app-owned boundary without granting broad filesystem or network access.

Replicator, not Claude, captures digest-bound scenario results and final screenshots. There is no manual, source-inspection, or smoke-only Ready bypass.

Use `native automate assert` for polling assertions and the built-in widget, action, key, focus, drag, wheel, resize, shortcut, menu, and bridge verbs for scenario steps. Do not write automation command files directly, add sleeps, or parse `snapshot | grep`; the CLI owns its ordered command protocol and reports missing patterns with the snapshot tail. Require `ready=true`, zero dispatch errors, and a matching automation protocol. `native automate provenance` may locate a rendered widget's source during repair, but every edit still passes through Replicator's path policy and no edit is allowed after verification begins.

During Acceptance Runs, point `NATIVE_SDK_LOG_DIR` at the Utility's bounded evidence directory and retain Native's JSONL runtime log instead of implementing a second runtime logger. Agent and worker logs remain separately bounded and redacted. Record/replay journals may support Prepared Demo diagnosis, but they contain owner inputs and effect data and must never substitute for a live Acceptance Run or ship unsanitized.

## Eight-hour execution order

### H0:00 to H1:00, prove the package first

The lead creates short-lived worktrees, fixes the protocol and registry shapes above, pins runtime versions, and prevents overlapping file ownership.

In parallel:

- Packaging owner uses the protected launcher shape plus `native package --target macos --signing adhoc` to create a tiny outer app with relative bundled Node, Native, and Zig paths. It must inject the three launch paths, spawn an echo worker, build a minimal Utility into Application Support, package it with Native, and launch it. Retain commands, architectures, paths, durations, and screenshots.
- Adapter owner creates the three protected templates, path policies, digest functions, Native validation path, and the first WebView harness slice.
- UI owner implements the approved builder against fixed protocol fixtures using the built-in split, bounded list/list-item, timeline, stepper, alert, input-group, textarea, anchored menu, context-menu, dialog, image, badge, progress, and spinner components. The fixtures cover Reference Images, evidence, launch, Revision, and one-global-request disabling.
- Lead implements compiled worker startup, NDJSON decoding, atomic registry creation, immediate Agent SDK session persistence, and the single query/resume path.

H1 gate: the packaged toolchain probe must pass. If it fails, the packaging owner stays on it. If it is still failing at H2, all owners stop feature work and join the packaging critical path because no valid submission is possible without it.

### H1:00 to H3:30, finish the bounded Native vertical slice

The lead first proves the bounded Reference Image picker helper through `Cmd.spawn`, including dismissal, cancellation, four selections, and overlong-output rejection, then wires planning, one real Clarification path, accepted plan persistence, scoped edit tools, timeout and cancellation, Revision resume, snapshots, rollback, and evidence events. The adapter owner completes the built-in Native development, validation, ReleaseFast automation, packaging, digest binding, and launch path. The UI owner replaces fixtures with real events and registry state.

H3:30 gate: the exact Focus Sprint Build and Revision must each reach a behavior-verified, packaged, launchable Ready Artifact through the Agent SDK path, with the same Claude Session resumed after a builder restart.

### H3:30 to H5:00, complete every format

Add multi-module Native and React/WebView without adding a second orchestration path. Complete the protected WebView DOM harness and its shell bridge. Execute the controlled CSV Inspector and Color Palette Organizer Build and Revision pairs.

H5 gate: each Utility Format has completed Build and Revision through verification, packaging, launch, persistence, and evidence capture.

### H5:00 to H6:00, integrate the submission flow

Complete Reference Image normalization, the approved UI states, Prepared Demo seeding, bounded telemetry, restart recovery, browse-and-launch-only credential expiry, and judge-facing failure messages. Exercise cancel and failed-Revision recovery.

H6 gate: feature freeze. If any Submission Floor item is incomplete, cut rename, soft delete, animation and fine styling, and the optional telemetry analyzer in that order. Do not cut a Utility Format, Session resume, Behavior Contract enforcement, standalone packaging, Prepared Demo, or recovery proof.

### H6:00 to H7:00, assemble and accept on the build account

Treat `app.zon` as the source of truth for identity, window, permissions, capabilities, WebView layer, icon, and boot assets. Run `native validate app.zon`, `native doctor --manifest app.zon --strict`, and `native build --yes -Dautomation=true` to produce the outer Native UI binary. Compile the bounded Swift launcher and Reference Image picker, then stage those binaries plus Node, Agent SDK, the complete Native CLI payload, Zig, the compiled worker, and clean immutable resources in one package-assets directory. Run `native package --target macos --binary <launcher> --assets <package-assets> --signing adhoc` only after staging is complete. Accept the package only when Native reports the signature verified. Do not generate `Info.plist` or `.icns`, sign nested files manually, or modify the `.app` after Native signs it.

Create the required judge ZIP from the finished app with a small metadata-preserving `ditto` step, then compute hashes. Do not use `native package --archive` for this artifact because the macOS archive output is a DMG. Generate the judge README and seed only the clearly labelled Prepared Demo. Keep Reference Images and other private inputs outside declared Utility `assets/` unless they are intentionally part of the packaged Utility because Native ships every declared asset.

Run all six controlled format Acceptance Runs against this assembled package using a separate acceptance registry. Run one Clarification interaction, cancellation, failed Revision rollback, restart persistence, invalid-key degradation, evidence redaction, and secret scanning. Create the accelerated and full-speed demo captures.

### H7:00 to H8:00, fresh-account acceptance and release

Create a dedicated limited Anthropic workspace key with a one-day lifetime or scheduled deletion, inject it only through the packaging environment, then rebuild and repackage with `native package --target macos --signing adhoc`. Remove the key from the environment and shell history afterward. The key is a hard submission blocker.

On a fresh macOS account set to dark appearance, with quarantine preserved, no global development tools, and no local Claude login, follow only `README-JUDGES.md`. Control-click Open once, inspect and launch Prepared Demo, then complete the exact Focus Sprint Build and Revision. Restart Replicator between them to prove persistence, window restoration, and Session resume.

If the Submission Floor passes, compute hashes, create a GitHub Release tagged `v0.1.0-hackathon`, upload `Replicator.zip`, checksums, the judge README, and sanitized evidence, then link that release from the submission. If it does not pass by H8, continue only on the critical path and do not upload a narrower or misleading product.

## Ownership and integration

The lead owns requirements, protocol, registry, Agent SDK integration, state machine, merge order, and final verification. Three workers may operate concurrently:

- Packaging owner: `host/launcher.swift`, `host/reference-picker.swift`, `scripts/assemble-release.sh`, staged packaged-toolchain layout, Native validation/build/package invocation, metadata-preserving ZIP, README, hashes, and package probes.
- Adapter owner: `worker/targets.ts`, `worker/verification.ts`, protected templates, scaffolds, digests, validation, Behavior Scenario execution, and the WebView bridge.
- UI owner: root `app.zon`, `src/app.native`, `src/core.ts`, icon integration, and all approved builder states.

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

## Native SDK primary references

Implementation agents must check the bundled 0.8.1 skill output first because it is version matched. The corresponding first-party references are [Quick Start](https://native-sdk.dev/docs/quick-start), [CLI](https://native-sdk.dev/docs/cli), [Dev Server](https://native-sdk.dev/docs/cli/dev), [Testing](https://native-sdk.dev/docs/testing), [Automation](https://native-sdk.dev/docs/automation), [Packaging](https://native-sdk.dev/docs/packaging), [Package Distribution](https://native-sdk.dev/docs/packages), [Security](https://native-sdk.dev/docs/security), and [Agent Skills](https://native-sdk.dev/docs/skills).

## Decision record

The complete decision history is anchored in the [Wayfinder map](https://github.com/somus/replicator/issues/1). The implementation must follow its resolved tickets for the baseline, Agent SDK contract, credential feasibility, reuse boundary, runtime lifecycle, format routing, persistence, generation and recovery, behavioral verification, builder design, packaging, judging flow, and Utility design guidance.

The approved builder design spec is on [`somus/builder-design-prototype`](https://github.com/somus/replicator/blob/somus/builder-design-prototype/design-prototype/builder-design-spec.md). The approved judging walkthrough and Focus Sprint reference are on [`somus/judging-demo-prototype`](https://github.com/somus/replicator/tree/somus/judging-demo-prototype/demo-prototype).
