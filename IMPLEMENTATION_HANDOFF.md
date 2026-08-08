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

Treat Native guidance as an immutable release input with two complementary corpora. The CLI skills provide version-specific constraints and routing, while a frozen mirror of the official Markdown documentation provides the complete component and API reference.

Before H0, run `scripts/sync-native-docs.mjs`. It fetches `https://native-sdk.dev/llms.txt`, accepts only unique `https://native-sdk.dev/docs/*.md` links, downloads every listed page with at most eight concurrent requests, requires a successful Markdown response, and writes through a temporary directory. Generate `resources/native-docs/index.json` with the catalog URL and SHA-256, generation time, page count, and every page's title, source URL, relative path, byte count, SHA-256, and heading byte ranges. Review and lock the resulting catalog digest before implementation. The approved snapshot currently contains 96 pages, including 48 component pages; any later page-set or digest change requires review and rerunning all Acceptance Runs.

During release assembly, invoke the bundled CLI and capture stdout from these commands into a temporary `resources/native-skills/0.8.1/` directory:

```bash
native skills list
native skills get native-ui
native skills get ts-core
native skills get automation
native skills get core --full
native skills get zig
```

Generate `manifest.json` beside the captured skills. Record the exact `native version`, automation protocol, skill ID, relative file, byte count, SHA-256, and a heading index with byte ranges for every guide. Fail assembly if the CLI version differs from 0.8.1, a required skill is missing or empty, either corpus contains an escaping path or symlink, or a recorded digest changes before packaging. Rename the completed skills directory into place atomically, then package both frozen corpora. The packaged app performs no documentation network requests and never relies on the judge's global Native installation.

Route guidance by surface: `native-ui` and `ts-core` for the outer builder and Native Utilities, `automation` for host verification, `core --full` for runtime, React/WebView, and packaging work, and `zig` only for a protected Zig shell or a proven host seam. Prefer Native effects such as `Cmd.spawn`, `Cmd.cancel`, `Cmd.readFile`, `Cmd.writeFile`, `Cmd.fetch`, clipboard, timers, and platform dialogs over shell scripts or OS-specific substitutes, but verify that the feature is exposed to the selected TypeScript, Zig, or WebView surface before using it.

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
  agent.ts                deep attempt module: Session, phased tools, attestation
  native-guidance.ts      manifest validation, bounded search/read, repair routing
  targets.ts              format policies, scaffolds, path guards, digests
  verification.ts         Native automation and WebView scenario execution
templates/
  native-bounded/
  native-multimodule/
  react-webview/
resources/
  native-skills/0.8.1/    immutable CLI-generated guides and manifest
  native-docs/            frozen official Markdown pages and index
scripts/
  assemble-release.sh     stage resources, Native package, ditto ZIP, hashes
  sync-native-docs.mjs    atomically refresh and index the official docs mirror
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
- `start_attempt`: Utility ID, request ID, Build or Revision kind, request text, normalized Reference Image metadata, current source digest, Ready Artifact metadata, and optional validated operator-only model or effort overrides. The builder UI emits no overrides.
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

Derive owner-visible progress from accepted tool calls, not from Claude's free-form narration. Translate tool names into short updates such as Reading source, Editing markup, Validating, Verifying behavior, and Preparing app. Persist tool name, stage, duration, outcome, repair scope, and resulting digest; never persist tool inputs, source replacements, prompts, model prose, or full tool output.

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

type NativeGuidanceSelection =
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
      component?: {
        element: string;
        bindings: string[];
        events: string[];
      };
    };
```

Add `nativeGuidance: NativeGuidanceSelection[]` to `AcceptedPlan`.

Persist Owner Timeline entries for Build Requests, Revision Requests, and Clarification questions and answers. Do not persist the Agent SDK transcript, hidden reasoning, full edit payloads, secrets, or unbounded tool output.

Persist `ActiveAttemptRecord` after Session initialization and after every accepted plan or mutating tool boundary. Keep attempt ID and kind, phase, active elapsed time, pre-attempt snapshot, accepted plan and contract references, current, validated, verified, and binary digests, packaged artifact metadata, finalization nonce, last accepted tool, last repair scope, and the system-instruction version and digest used for each query. On restart, a Clarification resumes normally; an interrupted build remains retryable from authoritative source; a failed Revision restores its pre-attempt snapshot before the previous Ready Artifact is exposed again.

### Native guidance contract

Use the same Claude Session for planning and coding, but change the tools the host exposes at the accepted-plan boundary. During planning, expose read-only `list_native_guides`, `search_native_guides`, `read_native_guide`, `list_native_docs`, `search_native_docs`, and `read_native_doc` tools plus the Reference Image tools; do not expose source or edit tools. Embed the compact skill and official-page catalogs in the planning prompt, never the full bodies. Search returns at most eight 1 KiB excerpts. A read accepts one indexed ID plus section ID and returns at most 12 KiB with a continuation cursor; cap all guidance returned during planning at 48 KiB. Reject absolute paths, traversal, symlinks, unknown IDs, stale digests, and requests outside the packaged corpora.

The accepted plan records the smallest guidance selection needed to implement the request, capped at eight skill sections and sixteen official pages. Each entry names its purpose and locks exact IDs and sections to the packaged digest. For every selected Native markup component, the planner must read its exact `docs/components/*.md` page and record the element, required bindings, and events in the official selection. It must also read the narrowest relevant non-component page for TypeScript, effects, images, state, theming, manifest, WebView, security, or packaging behavior. The host validates the selection against the Utility Format before exposing edit tools:

- Bounded and multi-module Native select routing constraints from `native-ui` and `ts-core`, then select the exact official component and topic pages needed by their accepted design. Add `core` only for a manifest, runtime, or packaging concern that the protected adapter does not already own.
- React/WebView selects the narrowest `core --full` and official WebView, frontend, bridge, security, and packaging sections. It may not select `native-ui` or component pages unless the accepted design includes a real native-rendered surface.
- `automation` belongs to the host verification path. Expose one of its sections to Claude only when Claude must understand or repair a Behavior Scenario.
- `zig` belongs to protected shell and host work. The Utility coding agent may not use it to escape the selected format or edit a protected file.

During coding, expose `read_native_guide` and `read_native_doc` only for the plan's approved IDs and sections, with a 48 KiB total read budget. The coding prompt contains the immutable owner request, accepted plan, Behavior Contract, and approved guidance IDs and digests; it does not contain every skill or page body. Require Claude to read the approved official component page before editing the component it governs and to follow its demonstrated structure, attributes, bindings, and event payloads. Do not expose general documentation search after edits start.

Map deterministic diagnostics to one additional bounded repair section when the accepted selection is insufficient: `NS1001` through `NS1060` to `ts-core` plus the indexed official TypeScript page; markup, binding, component, and accessibility diagnostics to `native-ui` plus the exact component page; automation protocol and action failures to `automation` plus the official automation page; manifest, WebView, bridge, frontend, and package failures to `core` plus the matching official topic page; and Zig 0.16 standard-library failures to `zig`. The host records the added ID, section, reason, digest, and byte count in Request Attempt evidence before retrying. Cap diagnostics at 12 KiB and guidance excerpts at 12 KiB per repair attempt; never inject an entire skill or unrelated page as fallback context.

On Revision, resume the same Session, keep the locked Utility Format and prior accepted guidance selection, rerun planning for the new owner request, and add or remove sections only when the revised plan requires it. Persist corpus names, page or guide IDs, section IDs, digests, purposes, and bounded read telemetry, but do not copy documentation bodies into the Utility folder, registry, Owner Timeline, or uploaded evidence.

### Agentic build module

Make `worker/agent.ts` one deep module with one caller-facing interface: `runAttempt(context, emit, signal)`. The rest of Replicator supplies the immutable request, Utility record, current source and Ready digests, packaged resource paths, and cancellation signal; it receives Clarification, failed or interrupted, or a host-accepted Ready result. Keep Agent SDK events, phased tool grants, tool state, command execution, evidence invalidation, and finalization attestation inside this module. Do not add a generic agent framework or expose individual tools through the host-worker protocol.

#### Model and effort routing

Keep model routing host-owned and deterministic. Planning and Clarification always use the Agent SDK `sonnet` alias at low effort. For building and Revision, use `haiku` only when the validated request explicitly overrides the model to Haiku; otherwise use `sonnet`. Use an explicit low or medium effort override when present. Without an effort override, use low for Haiku or Bounded Native and medium for Multi-module Native and React/WebView. Recompute the default after the host accepts and locks the planned Utility Format; a Revision uses its already locked format. Do not let Claude select or change its model or effort.

| Phase | Utility Format | Model | Effort |
| --- | --- | --- | --- |
| Planning or Clarification | Any | `sonnet` | `low` |
| Building or Revision | Bounded Native | `sonnet` | `low` |
| Building or Revision | Multi-module Native | `sonnet` | `medium` |
| Building or Revision | React/WebView | `sonnet` | `medium` |
| Building or Revision with model override | Any | `haiku` | `low` unless effort is explicitly overridden |

Accept only `haiku` or `sonnet` model overrides and only low or medium effort overrides. Keep these fields in the validated worker request for operator and Acceptance Run experiments, but do not expose a model picker in the builder UI. Do not add automatic model fallback: an unavailable or unauthorized selected model fails the attempt with a bounded owner-facing credential or availability error rather than silently changing behavior.

At Session initialization, inspect the Agent SDK model information and applied settings. Fail preflight if the routed model is unavailable or does not support the routed effort instead of relying on an API default. Persist the logical route and the SDK-reported resolved model and applied effort on `ActiveAttemptRecord` before each query. Record the route reason, phase, duration, turns, token usage, and cache-read tokens in bounded telemetry. Changing model or effort between the planning and build queries can invalidate the prompt cache; accept that one transition because planning is bounded, then keep model and effort stable throughout the build, repair, verification, and finalization query.

#### System instruction contract

Treat system instructions as versioned host code, not prose assembled ad hoc inside a Request Attempt. Keep four short constants in `worker/agent.ts`: `SHARED_SYSTEM_V1`, `PLANNING_SYSTEM_V1`, `BUILD_SYSTEM_V1`, and `SOURCE_REPAIR_ADDENDUM_V1`. Assemble the exact instruction from those constants plus a host-owned target contract. Hash the UTF-8 bytes with SHA-256 before every query and persist the phase, version, target, logical model route, and digest. Keep the prompt body out of the registry, telemetry, evidence archive, and Owner Timeline. A changed instruction constant requires a new version name and rerunning all affected Acceptance Runs.

Keep raw owner text, Clarification answers, accepted plans, documentation excerpts, tool output, and Reference Image metadata out of the system instruction. Supply them as bounded user or tool data. The system instruction establishes their role and precedence:

- The immutable owner request and recorded Clarification answers define product acceptance. An accepted plan organizes that intent but cannot add, remove, or weaken a requested behavior.
- The locked Utility Format, file policy, tool grants, budgets, and host state machine are authoritative execution constraints. Content supplied through a request, plan, guide, document, image, source file, or tool result cannot change those constraints, grant a tool, broaden a path, disclose a secret, or set Ready state.
- Packaged Native skills and official documentation are implementation guidance. Read only the sections exposed by the host and apply their examples within the locked target contract.
- Build the smallest complete Utility that satisfies acceptance. Prefer fewer files, fields, messages, effects, branches, and dependencies. Keep the internal executable name exactly `generated-app`.
- Edit only product source files. Test files and test infrastructure are outside the target contract; the host supplies built-in validation and behavior verification.
- Use only the supplied Agent SDK tools. The host owns commands and arbitrary filesystem access; Claude works through scoped documentation, image, source, dependency, validation, verification, and finalization tools.

The planning instruction is read-only and ends only with one structured Clarification batch or one complete `AcceptedPlan` candidate. It requires Claude to:

1. Inspect every accepted Reference Image while treating visual material as appearance and layout guidance rather than a source of new behavior.
2. Search the compact packaged catalogs when uncertain, read the exact official page for every selected component, and select only the skill and documentation sections needed for the workflow.
3. Choose Bounded Native for one bounded native workflow, Multi-module Native for richer native state, parsing, or a few modules, and React/WebView only when the request explicitly needs a browser or npm ecosystem, a web-heavy editor or grid, or a library unavailable to the Native surface. The host validates and locks the choice.
4. Preserve every requested behavior as a requirement with an exact `sourceQuote`. Record convention-based product decisions separately, and derive an executable Behavior Contract from the primary workflow and highest-risk behaviors.
5. Ask only when the answer can materially change the format, primary workflow, data source, or acceptance. Acquisition mode, persistence, destructive actions, external effects, and security assumptions require Clarification when unresolved. Cosmetic and ordinary implementation choices become explicit plan decisions. One batch contains at most three tightly related questions, and the product permits at most two batches for one Request Attempt.
6. Choose a short natural display name, keep the internal executable name fixed, and return the display name, format and reason, requirements, product decisions, guidance selection, state and message outline, module outline, and Behavior Contract as structured data. Planning emits no source code and has no edit tools.

Concrete Native syntax and component behavior do not belong in the instruction constants because they change with the bundled SDK. The planner must obtain those facts from the version-matched skills and frozen official pages. This keeps the instruction stable while the guidance manifest remains the source of truth for markup, bindings, events, effects, and target limitations.

The build instruction defines a focused coding loop inside the isolated Utility folder. Claude first inspects authoritative current source and approved guidance, then makes scoped edits. The owner request remains acceptance authority; the accepted plan is implementation guidance. A Revision preserves existing accepted behavior unless the new request explicitly supersedes it. Hidden verification conveniences never become product behavior.

Claude repeats `inspect -> edit -> validate -> focused repair -> verify` until every accepted Behavior Scenario passes, then calls `finalize_app` exactly once as its final tool. A successful validation closes speculative cleanup, refactoring, styling, dependency, and source work. Only a later `repairScope=source` failure reopens source editing. `repairScope=scenario` permits corrected scenario input, and `repairScope=host` permits one retry of the host operation. Claude reports progress briefly through tool use and never emits whole project files as its final response.

Append `SOURCE_REPAIR_ADDENDUM_V1` only when the latest deterministic failure has `repairScope=source`. It tells Claude to treat the current source and returned diagnostics as authoritative, apply the smallest exact replacement with a unique `oldText`, preserve working behavior, and rerun validation. It excludes whole-file rewrites, unrelated cleanup, speculative APIs, and explanatory output. This is an instruction change within the same build Session and model route, not a separate repair model or host-authored patch path.

Prompt assembly order is fixed: shared instruction, phase instruction, locked target contract, then the source-repair addendum when authorized. The target contract contains only trusted enums, limits, tool names, protected paths, and instruction versions. Session resumes reuse the same instruction version for their phase; Clarification answers and revised requests are appended as user data. Reject a resume when its persisted instruction version is unavailable rather than silently substituting new behavior.

Run planning and building as staged queries in the same persisted Claude Session:

1. Start or resume the Session with only documentation and Reference Image tools. Require either one structured Clarification batch or an `AcceptedPlan` candidate with Utility Format, component documentation, module outline, and executable Behavior Contract.
2. Persist the Session ID immediately. If Claude asks a Clarification, persist the batch and exit cleanly; resume the same Session after the owner answers.
3. Validate and lock the plan in the host. Scaffold the selected format, create a pre-attempt snapshot for Revision, then resume the Session with the accepted plan, immutable owner request, authoritative current source digest, remaining active time, and the format-specific build tools.
4. Let Claude inspect source, read approved guidance, make scoped edits, validate, repair, and invoke Behavior Scenarios. The host executes every tool and returns bounded deterministic results; it never asks Claude to emit whole project files as a final response.
5. Require `finalize_app` as Claude's final tool call. The host independently validates its nonce, source and binary digests, scenario evidence, packaged artifact metadata and signature, and launch result before it emits `artifact_ready` or writes Ready state.

The structured plan contains the display name, locked format and reason, primary workflow, at most six requirements, explicit product decisions, guidance selection, state and message outline, module outline, and Behavior Contract. Every requirement carries an exact `sourceQuote` from the owner request or a recorded Clarification answer plus a separate acceptance statement. The host rejects a quote that does not occur in those sources and keeps Claude's convention-based product decisions separate from owner requirements. Reference Images may inform visual decisions but never count as a behavior source.

Expose only these Agent SDK tools during the build phase:

| Tool | Host-enforced behavior |
| --- | --- |
| `list_app_files`, `read_app` | Show only files allowed by the locked format. Bound file output and omit dependencies, generated output, evidence, secrets, and protected shell files. |
| `edit_app` | Apply one exact old-text/new-text replacement to one editable file. Require a unique match unless `replaceAll` is explicit, cap both strings at 60 KiB, reject stale source, and invalidate all later evidence after a successful edit. |
| `create_app` | Create one new file allowed by the format. Reject existing files, tests, hidden or nested paths outside policy, and the multi-module cap. Bounded Native does not expose this tool. |
| `add_web_dependency` | React/WebView only. Resolve a public package, require an exact version, install with lifecycle scripts disabled, update the protected lockfile through the host, and invalidate later evidence. Reject native add-ons and Git, file, URL, or workspace dependencies. |
| `list_reference_images`, `read_reference_image` | Expose only normalized images attached to this Utility through stable IDs. Require Claude to inspect every accepted image during planning; images guide appearance and structure but cannot add behavior. |
| `read_native_guide`, `read_native_doc` | Read only the accepted digest-locked guidance selection and any host-unlocked diagnostic section within the budgets above. |
| `validate_app` | Assert the format policy, run `native test` when `src/core.ts` changed since the last model contract, then run the required built-in Native checks. Return bounded diagnostics with `repairScope=source` and bind successful validation to the canonical source digest. |
| `verify_behavior` | Validate the proposed steps against one accepted Behavior Scenario, build or reuse the automation-enabled ReleaseFast binary for the validated digest, execute the adapter-owned runner, and bind structured evidence to that source and binary digest. Multiple calls may cover the contract's maximum three scenarios. |
| `finalize_app` | Require all scenarios and usability checks to pass for unchanged source and binary digests, package that exact binary without rebuilding it, launch the standalone `.app`, capture final evidence, and write a nonce-bound attestation for host acceptance. |

Every tool failure returns one repair scope. `source` unlocks a focused edit and invalidates validation, verification, binary, package, and launch evidence. `scenario` permits corrected scenario input or another required scenario but forbids source edits. `host` permits one retry of the host operation and forbids source edits; a repeated host failure ends the attempt. After validation succeeds, reject cleanup, refactoring, styling, dependency, or source changes unless the latest failure has `repairScope=source`. After `finalize_app` succeeds, reject every further tool call.

Generate the finalization nonce and attestation path in the host, never from Claude input. Hash canonical relative filenames plus bytes in sorted order, including protected WebView shell and lock files where applicable. The host recalculates every digest before accepting the attestation; the agent can request Ready preparation but cannot set registry state, choose evidence paths, or declare itself successful.

### Generation and recovery

Every Request Attempt uses the same host-enforced state machine:

1. Let Claude plan in the Utility's Session and resolve Clarifications.
2. Validate and lock the Utility Format, guidance selection, and Behavior Contract of at most three scenarios.
3. Create the working tree from an immutable scaffold produced and verified with the exact bundled `native init` version. Do not invent a scaffold or build graph.
4. Resume Claude with scoped build tools and let it drive source inspection, edits, validation, and focused repair.
5. After `Model` or `Msg` changes, make `validate_app` run `native test` and then `native check --strict`; allow source repair only while more than 80 seconds remain.
6. Let `verify_behavior` build the automation-enabled ReleaseFast candidate, execute the Behavior Contract against that exact binary, and reject dispatch or runtime errors.
7. Reserve the final 80 seconds for remaining verification and `finalize_app`, which binds digests, packages the verified binary, launches the standalone app, and writes its attestation.
8. Mark Ready only after the host independently accepts the attestation, confirms that final source and binary digests match their evidence, verifies the packaged artifact, and observes a successful launch.

The active deadline is 360 seconds. A Behavior Contract pass has a 45-second limit. Cancellation calls `Cmd.cancel` on the stable worker key, which kills and reaps the child process group, and records `interrupted` after the spawn stream reports `cancelled`. Do not layer an unproven graceful-signal timeout over this built-in lifecycle. An interrupted or failed initial Build retains partial source for retry. A failed Revision restores the persisted pre-revision snapshot and leaves the previous Ready Artifact launchable.

### Implementation mechanics to retain

Keep these narrow mechanics because they directly improve build reliability:

- Store a host-owned immutable format marker in every Utility folder. Centralize readable, editable, creatable, protected, and digest file policies in `worker/targets.ts`; every file tool and final digest uses that same policy.
- Snapshot editable files before Revision and restore the snapshot unconditionally on failure. Initial Build may retain partial source for Retry, but it never overwrites a Ready Artifact.
- Keep documentation and Reference Image access read-only and allowlisted. The build agent sees stable IDs rather than arbitrary paths.
- Record bounded JSONL telemetry for stage durations, model usage, first edit, tool names, diagnostics count, repair scope, and digests. Truncate long output from both ends, redact credentials and absolute machine paths, and never record edit payloads or owner prompt text.
- Translate tool calls into deterministic builder progress instead of displaying private model activity. Tool outcomes, not Claude narration, drive the Owner Timeline and attempt state.

Do not carry forward the keyword-only format router, prompt-regex acceptance inference, a separate non-persistent planner session, a second repair model, a host fallback that marks Ready without agent finalization, custom regex checks that duplicate `native check`, raw edit telemetry, an `osascript` picker, source-string WebView verification, or migration code for abandoned storage shapes. Do not package example summaries pinned to Native commit `21f6057` with the bundled `b21849c` CLI; use the frozen official docs unless those summaries are regenerated and reviewed against `b21849c`. The accepted plan and adapter validate routing; the Native CLI validates Native source; the protected DOM harness validates WebView behavior; the Swift helper owns image selection; and the current registry starts at version 1.

## Utility Format adapters

### Bounded Native

Claude may edit only `app.zon`, `src/app.native`, and `src/core.ts`. Reject symlinks, traversal, hidden files, generated output, and edits after verification begins unless a source-scoped verification failure invalidates all evidence and explicitly reopens editing. Keep the zero-configuration scaffold and do not add `build.zig`. After model-shape changes run `native test`, then `native check --strict`, build the ReleaseFast target with automation enabled, run Native automation scenarios against that exact binary, and package it with `native package --target macos --binary zig-out/bin/generated-app --signing adhoc`.

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

Use `native automate assert` for polling assertions and the built-in widget, action, key, focus, drag, wheel, resize, shortcut, menu, and bridge verbs for scenario steps. Do not write automation command files directly, add sleeps, or parse `snapshot | grep`; the CLI owns its ordered command protocol and reports missing patterns with the snapshot tail. Require `ready=true`, zero dispatch errors, and a matching automation protocol. `native automate provenance` may locate a rendered widget's source during repair, but every edit still passes through Replicator's path policy and requires a source-scoped verification failure after verification begins.

During Acceptance Runs, point `NATIVE_SDK_LOG_DIR` at the Utility's bounded evidence directory and retain Native's JSONL runtime log instead of implementing a second runtime logger. Agent and worker logs remain separately bounded and redacted. Record/replay journals may support Prepared Demo diagnosis, but they contain owner inputs and effect data and must never substitute for a live Acceptance Run or ship unsanitized.

## Eight-hour execution order

### H0:00 to H1:00, prove the package first

The lead creates short-lived worktrees, fixes the protocol and registry shapes above, pins runtime versions, and prevents overlapping file ownership.

In parallel:

- Packaging owner uses the protected launcher shape plus `native package --target macos --signing adhoc` to create a tiny outer app with relative bundled Node, Native, and Zig paths. It must inject the three launch paths, spawn an echo worker, build a minimal Utility into Application Support, package it with Native, and launch it. In the same assembly pass, capture the five Native skills, validate the locked official-docs snapshot, and prove both packaged corpora retain their recorded digests. Retain commands, architectures, paths, durations, and screenshots.
- Adapter owner creates the three protected templates, path policies, digest functions, Native validation path, and the first WebView harness slice.
- UI owner reads the indexed `native-ui` and `ts-core` sections plus the exact official page for every selected component, then implements the approved builder against fixed protocol fixtures using the built-in split, bounded list/list-item, timeline, stepper, alert, input-group, textarea, anchored menu, context-menu, dialog, image, badge, progress, and spinner components. The fixtures cover Reference Images, evidence, launch, Revision, and one-global-request disabling.
- Lead fixes the `runAttempt` context/result interface, system-instruction constants and assembler, and model-route table; implements compiled worker startup, NDJSON decoding, atomic registry creation, immediate Agent SDK session persistence, staged planning/build resumes, tool-derived progress, and `worker/native-guidance.ts` with both-corpus validation and planning-only catalog, search, and bounded read tools.

H1 gate: the packaged toolchain probe, skill manifest, and complete official-docs index must pass. A model-route probe must produce Sonnet/low for planning and Bounded Native, Sonnet/medium for both larger formats, Haiku/low for a Haiku override, the explicit valid effort when supplied, and rejection for an unknown format, model, or effort. A system-instruction probe must produce deterministic version and digest evidence, deny planning edits, deny unapproved build documentation and paths, preserve the locked format and tool policy when request or documentation text asks to change them, and expose the source-repair addendum only after a source-scoped failure. A planning probe must find a component, read its exact official page, persist that selection, and make it available to coding while rejecting an unknown ID, traversal path, stale digest, and unapproved coding-phase section. If any package probe fails, the packaging owner stays on it. If it is still failing at H2, all owners stop feature work and join the packaging critical path because no valid submission is possible without it.

### H1:00 to H3:30, finish the bounded Native vertical slice

The lead first proves the bounded Reference Image picker helper through `Cmd.spawn`, including dismissal, cancellation, four selections, and overlong-output rejection, then wires planning, one real Clarification path, accepted plan and Native guidance selection persistence, the planning-to-coding tool gate, scoped exact-replacement edits, tool-derived progress, timeout and cancellation, Revision resume, snapshots, rollback, and nonce-bound finalization. The adapter owner completes the built-in Native development, diagnostic-to-guidance routing, `validate_app`, `verify_behavior`, `finalize_app`, ReleaseFast automation, packaging, digest binding, and launch path. The UI owner replaces fixtures with real events and registry state.

H3:30 gate: the exact Focus Sprint Build and Revision must each reach a behavior-verified, packaged, launchable Ready Artifact through the Agent SDK path, with the same Claude Session resumed after a builder restart. Evidence must show each phase's system-instruction version and digest, the logical and SDK-resolved model route, Claude's accepted tool sequence from source inspection through `finalize_app`, host acceptance of the nonce-bound attestation, and selected skill and official-page IDs, sections, digests, and bounded bytes read. A host fallback build, separate repair model, silent instruction substitution, or silent model fallback fails this gate.

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

- Packaging owner: `host/launcher.swift`, `host/reference-picker.swift`, `scripts/assemble-release.sh`, `scripts/sync-native-docs.mjs`, staged packaged-toolchain layout, CLI-generated Native skills, the frozen official-docs snapshot, both indexes and manifests, Native validation/build/package invocation, metadata-preserving ZIP, README, hashes, and package probes.
- Adapter owner: `worker/targets.ts`, `worker/verification.ts`, protected templates, scaffolds, digests, diagnostic-to-guidance routing table, validation, Behavior Scenario execution, and the WebView bridge.
- UI owner: root `app.zon`, `src/app.native`, `src/core.ts`, icon integration, and all approved builder states.

The lead owns `worker/agent.ts`, its single `runAttempt` interface, versioned system-instruction constants and deterministic assembler, model and effort route, Agent SDK Session lifecycle, phased tool grants, tool dispatcher and progress translation, `worker/native-guidance.ts`, guidance fields in shared protocol types, and integration of the adapter owner's format-routing table. The adapter owner supplies validation, verification, finalization, and format-policy implementations behind that internal tool seam. The packaging owner may write only the generated skills and official-docs directories and their indexes; other owners treat both directories as immutable.

Use separate worktrees, short commits, and non-overlapping files. The lead fixes shared types before parallel work, reviews every merge, and owns any cross-boundary edit. No worker redesigns the product contract or silently cuts scope.

## Controlled Acceptance Runs

Use a separate acceptance registry and retain bounded evidence. Only the Focus Sprint Prepared Demo is seeded into the Submission Package.

### Bounded Native: Focus Sprint

Build Request:

> Build a native Focus Sprint timer for macOS. Include 25-minute Focus, 5-minute Break, and 10-second Demo presets; show remaining time and current mode; provide Start, Pause, and Reset; and count completed focus sprints. Use the attached Reference Image for the dark appearance, hierarchy, density, and calm visual direction.

Revision Request:

> Add a configurable daily goal, defaulting to four focus sprints, with a clear progress bar and a subtle celebration when the goal is reached. Preserve every timer preset, control, and completed-sprint behavior.

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
- Planning and building run through staged queries in that same Session; Claude drives the scoped edit, validation, repair, verification, and finalization tools, and no separate repair model or host Ready fallback exists.
- Every query records its versioned system-instruction digest. Planning remains read-only, locked target and tool policies survive untrusted request and guidance content, source repair is enabled only by a source-scoped diagnostic, and a resumed phase never silently substitutes another instruction version.
- Every query follows the locked model route: Sonnet/low for planning, Sonnet/low for default Bounded Native, Sonnet/medium for both larger default formats, or the validated operator-only model and effort override. Evidence retains the SDK-resolved model and applied effort, and no silent fallback occurs.
- One global Request Attempt, structured Clarification, Reference Images, cancellation, retry, and unconditional failed-Revision rollback behave as specified.
- All three Utility Formats pass their exact Build and Revision Acceptance Runs through the final package.
- The packaged skill manifest matches Native 0.8.1, the official-docs index matches the reviewed catalog snapshot, and every recorded file digest verifies. Each Acceptance Run records only approved corpus, page or guide, section, digest, reason, and bounded bytes read.
- Every Ready Artifact has an immutable format, accepted plan, accepted nonce-bound finalization attestation, digest-matched Behavior Contract results, usability result, screenshots, standalone `.app`, and successful launch.
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

Implementation agents must use the bundled 0.8.1 skills for routing and constraints, then read the frozen official page for every component or API they use. The corresponding first-party references are [Quick Start](https://native-sdk.dev/docs/quick-start), [CLI](https://native-sdk.dev/docs/cli), [Dev Server](https://native-sdk.dev/docs/cli/dev), [Testing](https://native-sdk.dev/docs/testing), [Automation](https://native-sdk.dev/docs/automation), [Packaging](https://native-sdk.dev/docs/packaging), [Package Distribution](https://native-sdk.dev/docs/packages), [Security](https://native-sdk.dev/docs/security), and [Agent Skills](https://native-sdk.dev/docs/skills).

## Decision record

The complete decision history is anchored in the [Wayfinder map](https://github.com/somus/replicator/issues/1). The implementation must follow its resolved tickets for the baseline, Agent SDK contract, credential feasibility, reuse boundary, runtime lifecycle, format routing, persistence, generation and recovery, behavioral verification, builder design, packaging, judging flow, and Utility design guidance.

The approved builder design spec is on [`somus/builder-design-prototype`](https://github.com/somus/replicator/blob/somus/builder-design-prototype/design-prototype/builder-design-spec.md). The approved judging walkthrough and Focus Sprint reference are on [`somus/judging-demo-prototype`](https://github.com/somus/replicator/tree/somus/judging-demo-prototype/demo-prototype).
