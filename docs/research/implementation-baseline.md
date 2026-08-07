# Implementation baseline for the hackathon build

## Verdict

The one-day build should use one constrained Native SDK target and carry forward four proven mechanics: authoritative project files, host-enforced file boundaries, Debug-build behavior checks, and digest-gated release finalization. The telemetry and source do not support spending the day on multi-target routing, a separate planning agent, resumed model sessions, or a public-distribution trust model.

The safest implementation is a thin builder around `app.zon`, `src/app.native`, and `src/core.ts`. Each generation should start a fresh coding-agent invocation, edit only those files through host-owned tools, run `native check`, build once in Debug with automation, exercise the requested workflow through accessible names, and run ReleaseFast only after the source digest is frozen.

## Evidence quality

The baseline contains 58 run directories under `builder-runs/`. Fifty-six contain a terminal `run_completed` event; two are incomplete. The code and telemetry changed during these runs, so the aggregate is useful for identifying failure modes and latency floors, not for predicting a stable production success rate. No committed history or tag anchors the source snapshot, so every adopted file still needs a focused review when it enters the hackathon repository.

The local toolchain is internally aligned: `native --version` reports Native SDK 0.8.1, `package.json` pins `@native-sdk/core` 0.8.1, and the sidecar pins Bun types matching the installed Bun 1.3.14 (`package.json:5-7`, `sidecar/package.json:9-17`). The sidecar typecheck and root `native check` both pass on this snapshot.

## Adopt within one day

### Code

| Candidate | Adoption decision | Why it is safe at hackathon scope |
| --- | --- | --- |
| `sidecar/telemetry.ts` | Copy with only path/name changes. | It is 54 lines, writes bounded JSONL records, counts Native diagnostics, and truncates large command output. It already captures the timings and repair evidence needed to debug a live run (`sidecar/telemetry.ts:4-54`). |
| `sidecar/analyze-telemetry.ts` | Copy as an operator tool. | It turns one run into model, tool, command, diagnostic, and verification summaries without affecting the product path (`sidecar/analyze-telemetry.ts:1-108`). |
| Single-target parts of `sidecar/targets.ts` | Extract `normalizeProjectFile`, the exact three-file allowlist, `sourceDigest`, snapshot/restore, and project-policy checks. Delete target routing and the other target branches. | The path normalization and allowlist make the agent's authority concrete, while digesting the complete editable surface lets later stages reject stale evidence (`sidecar/targets.ts:28-55`, `sidecar/targets.ts:80-103`, `sidecar/targets.ts:119-161`). |
| Single-target editing tools from `sidecar/mcp.ts` | Extract `list_app_files`, `read_app`, and exact-replacement `edit_app`; retain evidence invalidation after edits and the post-validation edit lock. | Exact replacement forces the agent to operate on current source, and every successful edit invalidates validation and verification evidence (`sidecar/mcp.ts:276-284`, `sidecar/mcp.ts:289-355`). |
| Native validation and finalization stages from `sidecar/mcp.ts` | Extract the Native-only path for `validate_app`, `verify_behavior`, and `finalize_app`. | Validation runs deterministic preflight, `native check`, and an automation-enabled Debug build. Verification launches that exact Debug binary, checks nonblank rendering and zero dispatch errors, and drives controls by accessible name. Finalization accepts only the same source digest before building and hashing ReleaseFast (`sidecar/mcp.ts:435-470`, `sidecar/mcp.ts:473-636`, `sidecar/mcp.ts:639-693`). |
| Cancellation and deadline handling from `sidecar/index.ts` | Reuse the process-group termination pattern and one wall-clock deadline, but attach it to the chosen Agent SDK transport. | Child processes are detached, terminated as a group, and escalated from `SIGTERM` to `SIGKILL`, preventing abandoned model/build processes from consuming the demo machine (`sidecar/index.ts:386-393`, `sidecar/index.ts:539-605`). |

These are safe for a prepared demo machine with host-created project directories. `resolveProjectFile` performs lexical containment but does not resolve symlinks (`sidecar/targets.ts:157-161`), so this boundary is not sufficient for hostile downloaded projects or a public service.

### Template and asset

Use `generated/template/src/core.ts` and `generated/template/src/app.native` as the scaffold shape, because they demonstrate the required model/message/update contract, `[Model, Cmd<Msg>]` returns, literal integer bounds, subscription wiring, accessible controls, and closed markup (`generated/template/src/core.ts:11-73`, `generated/template/src/app.native:5-29`). Replace the counter behavior before the first agent turn so the agent does not waste time deleting sample features.

Use `generated/template/app.zon` only after normalizing it. Keep the fixed internal name and macOS platform, but replace its counter-specific labels and remove permissions that the selected demo does not need (`generated/template/app.zon:2-21`). In particular, `.permissions = .{ "view", "command" }` is broader than a generic small utility requires (`generated/template/app.zon:9`).

The three copies of `assets/icon.png` are byte-identical 1024 x 1024 RGBA PNGs. Their ownership or license is not documented. Do not publish that asset unless the owner confirms it; use a newly generated or clearly licensed placeholder instead.

### Documentation

Carry `docs/native-sdk-agent/essentials.md` and `docs/native-sdk-agent/index.md`, then add only the topic pages selected by the fixed demo envelope. These two files encode the high-value constraints that repeatedly prevented bad generation: immutable model/message shapes, byte-safe dynamic text, literal integer bounds, closed markup, accessible names, and the edit-validate-verify-finalize sequence (`docs/native-sdk-agent/essentials.md:1-49`, `docs/native-sdk-agent/index.md:1-51`).

Use the relevant short composition guide from `docs/native-sdk-examples/` when the demo needs editable text, collections, or effects. These guides link their claims to first-party examples pinned at commit `21f605704153b2ed2401b4ec75305e18219d99ef`; they are more useful to a coding agent than the 40-example survey (`docs/native-sdk-examples/editable-text.md:1-15`, `docs/native-sdk-examples/tables-collections.md:1-24`).

The official mirror contains 96 pages and records source URLs, byte counts, and SHA-256 hashes in `docs/native-sdk-official/index.json`; it was generated on 2026-08-07. Keep the atomic refresh script if a local mirror is required (`sidecar/sync-native-docs.ts:1-48`), but do not put the full mirror in every agent prompt. The working router always embeds only the essentials and index, then authorizes narrow topic pages (`sidecar/index.ts:168-190`, `sidecar/index.ts:236-283`).

### Behaviors

- **Fresh runs over authoritative files.** Follow-up modifications retain the target and read the existing project plus its compact build dossier, while every model invocation disables session persistence (`sidecar/index.ts:503-520`, `sidecar/index.ts:575-605`, `sidecar/index.ts:879-887`, `sidecar/index.ts:933-975`). This is the implemented continuity contract.
- **One source digest through validation, verification, and release.** Any edit clears later evidence; finalization refuses a digest that has not passed both earlier stages (`sidecar/mcp.ts:276-284`, `sidecar/mcp.ts:647-680`).
- **Debug-first verification.** Build automation-enabled Debug once, launch that binary directly, and reuse it for behavior scenarios. Do not launch through a development command that rebuilds before each check (`sidecar/mcp.ts:452-462`, `sidecar/mcp.ts:520-535`).
- **Accessible-name interaction.** Click and text-entry steps resolve controls from automation snapshots, so the same contract improves both testability and accessibility (`sidecar/mcp.ts:537-597`).
- **Rollback failed follow-ups.** Snapshot the editable files before a follow-up and restore them on failure, preserving the last ready application (`sidecar/index.ts:887-889`, `sidecar/index.ts:1032-1040`).
- **Bounded telemetry.** Record stage timing, diagnostics, edits, tool results, source digests, and finalization outcome for every live generation. Do not record raw credentials or environment values (`sidecar/telemetry.ts:13-42`, `sidecar/index.ts:895-905`).

## Do not adopt for the one-day build

### Multi-target routing and planning

Do not copy `routePrompt` or the three-target policy. Keyword routing sends broad terms such as `file`, `markdown`, `table`, or `chart` to a larger Native target and sends package-like wording to WebView (`sidecar/targets.ts:14-26`). A second model-based planner can then override that route. This doubles the decision surface and creates extra latency without improving the one constrained demo path.

Do not copy `sidecar/planner-mcp.ts`, the planner schema, clarification loop, or the full 1,076-line `sidecar/index.ts` orchestration module. Planner calls observed in later runs took 45.3 to 86.4 seconds before coding began, and planning still selected an unsuitable file-picker workflow in one rich Native run (`LEARNINGS.md`, “Measured results”). The fixed demo envelope can derive a compact dossier deterministically from the user request and selected docs.

Do not copy `generated/template-webview/`, the `webview-react` branches, or the broad `native-project` branch. WebView verification checks requested strings in React source and only smoke-tests the native shell, so it does not establish interactive Web behavior (`sidecar/mcp.ts:492-517`). Rich Native generation produced a successful initial run at 590.8 seconds and repeatedly entered runtime-markup repair loops, which is too close to the ten-minute deadline for a live demo.

### Transport and session state

Do not copy the Claude CLI adapter in `sidecar/index.ts:377-605`. It deliberately strips API credentials, invokes the locally authenticated `claude` executable, and passes `--no-session-persistence`. It does not establish Agent SDK authentication, streaming, cancellation, or error semantics. Preserve the host-tool protocol and replace this adapter with the chosen Agent SDK integration.

Do not model follow-up continuity as a Claude session ID. The Native UI calls each run ID a `sessionId`, while project identity is tracked separately (`src/core.ts:20-41`, `sidecar/index.ts:891-907`). Model history is not persisted. The reliable state is the generated source, target marker, and compact dossier.

### Builder UI implementation

Do not copy `src/core.ts` wholesale. It manually parses JSON strings by scanning to the next quote and does not handle escaped quotes (`src/core.ts:267-277`), so valid agent or project messages containing quoted text are truncated. It also combines project registry loading, generation, clarification, follow-up, metadata, and launch handling in one 532-line compiled core.

The visual composition in `src/app.native` is a useful reference for a project sidebar and conversational workspace, but the full 158-line view includes the discarded planner, clarification, multi-target, and library flows (`src/app.native:1-158`). Rebuild only the states required by the chosen demo: request entry, progress, ready/error, launch, and follow-up.

### Verification policy and generated state

Do not copy `verificationPolicyForPrompt` as the acceptance oracle. It recognizes only a few regex-derived requirements such as reset/retry, a numeric goal, text editing, invalid-input retention, and a named export (`sidecar/index.ts:246-268`). A follow-up builds that policy from the latest request, so preserved behavior can regress without being rechecked. The hackathon implementation should persist a small explicit acceptance dossier and verify both unchanged requirements and the current change.

Do not copy `builder-projects.json`, `builder-state.json`, `builder-runs/`, generated applications, `.zig-cache`, `zig-out`, temporary clarification files, or finalization attestations. These are machine-local run state and evidence, not source inputs. Do not carry the legacy-directory migration in `sidecar/projects.ts:37-69`; it adds destructive path movement to a fresh repository. If a project library is needed, retain only the versioned relative-path record shape and create/update/list operations (`sidecar/projects.ts:5-27`, `sidecar/projects.ts:72-102`).

The source-editor shell test is specific to one SVG editing fixture and uses fixed sleeps plus shell parsing (`sidecar/test-source-editor.sh:1-30`). It does not prove the generator loop and is outside the stated no-test hackathon scope.

## Measured constraints for the implementation handoff

### Run outcomes

Across the 56 completed run files, 34 ended in an accepted build and 22 failed. Seventeen failures ended within 100 ms of the configured 300, 360, or 600 second deadline; the remaining five recorded a failed coding-agent process with exit code 1. No completed failure falls outside those two classes. Two additional run directories have no terminal event.

This 60.7% aggregate acceptance rate must not become a launch forecast because target policy, timeouts, models, prompts, validation, and routing changed during collection. It does establish the main operational risk: 77.3% of terminal failures were deadline exhaustion, so scope and stage count matter more than broad retry logic.

Successful completed runs had a 163.8 second median, 227.8 second 90th percentile, and 590.8 second maximum. The narrow Sonnet-low benchmarks reported 3/3 success for Pomodoro at a 145.3 second mean and 3/3 for hydration at a 140.4 second mean; Haiku-low was slower at 196.9 and 215.4 seconds respectively (`LEARNINGS.md`, “Measured results”). Use Sonnet low for the constrained target.

### Stage budgets

Thirty-four Native-like successful finalization events between 60 and 76 seconds had a 69.7 second median, 69.0 second mean, 60.9 second minimum, and 75.2 second maximum. ReleaseFast therefore consumes about 70 seconds regardless of agent speed. Run it once, after the source and behavior are accepted, and show a distinct “Preparing app” state so the UI does not look stalled.

Across all 63 successful behavior-tool calls, the median was 1.7 seconds and mean was 2.7 seconds; the latest 20 had a 0.9 second median and 0.9 second mean. The optimized direct-binary behavior path is cheap enough to remain mandatory. It is also the only stage that catches runtime `MarkupBuild` and dispatch failures that static validation can miss (`sidecar/mcp.ts:520-623`).

The handoff should therefore use these budgets:

1. **Primary demo path: 180 seconds expected, 240 seconds operational ceiling.** The expected value covers the 140 to 164 second successful center plus normal variance. At 240 seconds, stop attempting discretionary repairs and move to a prepared fallback rather than consume the presentation.
2. **Hard generation deadline: 360 seconds for the constrained target.** The 600-second ceiling admitted a 590.8-second success that is unusable on stage. A six-minute internal cap still leaves diagnostics while preventing the builder from hanging for the full presentation slot.
3. **Release reserve: 80 seconds.** Do not begin ReleaseFast unless at least 80 seconds remain before the operational ceiling, because observed Native finalization peaked at 75.2 seconds.
4. **One coherent edit before validation, at most one source-repair cycle for the live path.** Repeated ScriptC and runtime-markup repairs were the dominant route to deadline exhaustion. If the second validation fails, preserve diagnostics and use the prepared application.
5. **No planning model call on the live path.** Spend the 45 to 86 seconds on implementation and verification. A deterministic request-to-dossier step should take negligible time.
6. **Persist the last ready source and executable before every follow-up.** The measured follow-up completed in 161.4 seconds, but it succeeded because the failed-run path could restore authoritative files. Never leave a demonstrated app in a half-edited state.

## One-day implementation order

1. Build the fixed Native scaffold and Agent SDK sidecar with a fresh invocation per request.
2. Add the exact three-file tool policy and source digest.
3. Add `native check`, one automation-enabled Debug build, accessible-name behavior verification, and one ReleaseFast build.
4. Add telemetry and cancellation before visual polish, because deadline exhaustion is the measured dominant failure.
5. Add follow-up editing with snapshot/restore and the persisted acceptance dossier.
6. Add the minimal builder states and a prepared fallback application.

Project library browsing, clarification, multi-target routing, WebView, richer modules, signing, installers, public downloads, and generalized security boundaries should remain outside this handoff unless the destination is explicitly expanded.
