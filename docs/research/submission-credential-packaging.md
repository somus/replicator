# Submission credential and packaging feasibility

Research date: 2026-08-08

## Decision

A macOS arm64 submission can give judges Claude-backed generation with no account login or local dependency setup, and the Claude access can expire automatically after about one day. There are two viable shapes, but they make different security tradeoffs:

1. **Recommended: use a small credential-injecting proxy.** Ship a Developer ID-signed and notarized app with all local executables and build tools included. Point the Claude Agent SDK at a narrowly scoped HTTPS proxy using `ANTHROPIC_BASE_URL`; keep a one-day Anthropic API key only on that proxy. The app can carry an event-specific capability rather than the Anthropic key, while the proxy enforces an expiry, request limits, and a fixed upstream. Anthropic describes this proxy pattern as the recommended way to keep credentials outside an agent's security boundary, and the Agent SDK explicitly supports `ANTHROPIC_BASE_URL` for it.[^anthropic-secure]
2. **Fastest, higher-risk: embed a one-day API key.** Anthropic now lets a key be created with a `1 day` preset or custom lifetime. Expiration is fixed at creation, expired requests return `401`, and an expired key cannot be reactivated.[^anthropic-auth] This meets the literal no-login and automatic-expiry requirements, but every recipient of the app must be treated as having the key for that day. Use this only as a time-bounded event credential in a dedicated non-default workspace, with low spend and rate limits, and revoke it immediately if the package leaks.

There is no documented mechanism that is simultaneously self-contained, secure against the app recipient, compatible with the Claude Agent SDK, and able to refresh without either a user login or a service outside the app. If a backend is out of scope, the one-day embedded key is technically workable, but its exposure must be accepted rather than hidden.

## Credential findings

### A one-day API key is a real server-enforced TTL

Anthropic API keys are static bearer secrets. The Console offers expiration presets of 3 hours, 1 day, 7 days, and 30 days, plus custom durations. The expiration cannot be changed after creation; after it passes, the API returns `401 authentication_error` and the key cannot be reactivated.[^anthropic-auth] The key should be created late enough that its fixed window covers packaging verification and the entire judging period.

The Claude Agent SDK's official quickstart requires an API key in `ANTHROPIC_API_KEY` and reads it from the agent process environment. It does not load `.env` automatically. Anthropic also says third-party products must not offer `claude.ai` login or use consumer plan rate limits unless Anthropic has approved them.[^agent-quickstart] A judge's Claude subscription is therefore not an acceptable zero-setup fallback.

A dedicated non-default workspace limits the credential's blast radius. Workspace API keys can access only resources in their workspace, and the workspace can have spend and rate limits below the organization limits.[^workspaces] Expiration limits duration, while workspace limits bound cost and request volume during that duration. Both controls are needed because a one-day key can still be abused heavily before it expires.

### Embedding cannot preserve secrecy

Putting a bearer key in an app resource, compiling it into a binary, or passing it to a child process changes where the bytes appear but does not keep them secret from someone who controls the app and machine. The recipient can inspect the bundle, binary, process, or network behavior. Moving an embedded key to Keychain on first launch does not repair the bootstrap problem because the original downloaded artifact still contains the key.

This conclusion matches Anthropic's guidance to store API keys in a secrets manager and to use a proxy that injects credentials so the agent never sees them.[^anthropic-auth][^anthropic-secure] Native SDK does expose macOS Keychain storage through its credential commands, but that protects a secret after it has been delivered securely; it does not provide secure first delivery to an arbitrary judge.[^native-credentials]

### Workload Identity Federation does not remove desktop bootstrap

Workload Identity Federation is compatible with Claude Code and the Claude Agent SDK. It exchanges an identity-provider JWT for a short-lived Anthropic access token and refreshes tokens through a configured profile or environment variables.[^wif] This is a strong fit for cloud workloads, CI, Kubernetes, and machines that already have a platform identity.

An arbitrary judge Mac has no such identity. Shipping a reusable IdP credential merely moves the embedded-secret problem upstream, while requiring the judge to authenticate introduces setup. WIF becomes useful only if the app can obtain a fresh identity assertion from a service or user login, so it does not replace the proxy for this distribution shape.

### App Attest is promising but does not fit this submission

Anthropic's App Attest integration is the only official option designed for a macOS app that calls Claude directly without shipping an API key or running a proxy. It attests a genuine registered installation, issues one-hour workspace-scoped tokens, and refreshes them automatically.[^app-attest]

It does not solve this submission path:

- The integration is beta, requires the OS 27 betas, and is exposed through Anthropic's Swift package.
- Setup requires an Apple Developer Team ID, an Xcode target with the App Attest capability, a registered bundle ID, and physical hardware with a Secure Enclave.
- Its tokens authorize only the Messages API. Anthropic does not document App Attest authentication for the Claude Agent SDK.
- The one-hour token TTL is not a one-day integration TTL. A valid installation keeps requesting new tokens until the app integration is manually revoked.

App Attest could support a later direct-Messages architecture, but adopting it here would require replacing the Agent SDK loop or adding a Swift/Xcode helper and still adding an explicit one-day revocation mechanism.

## Package construction findings

### Native SDK covers the outer app, not the complete generation toolchain

`native build` produces a ReleaseFast executable, and `native package --target macos` creates a macOS `.app` containing the main executable, generated `Info.plist`, icon, and the declared asset tree. The generated bundle targets macOS 11 or newer.[^native-packaging] A native-rendered release carries no JavaScript runtime.[^native-quickstart]

That package is sufficient for the UI executable, but local Claude-backed app generation has additional runtime requirements:

- The TypeScript Claude Agent SDK requires Node.js 18 or newer. Its package normally includes a native Claude Code binary through npm optional dependencies, but it still needs the JavaScript runtime that runs the SDK application.[^agent-quickstart]
- Native SDK's documented Node sidecar pattern explicitly says the child needs Node on the host.[^native-packages]
- Building generated Native SDK apps locally needs the Native CLI, the SDK source it carries, and Zig 0.16. The CLI can offer to download its pinned Zig toolchain on first build, but that is network-dependent setup and can prompt unless the toolchain is already present.[^native-quickstart]

For actual no-setup judging, the distributable must therefore include an arm64 Node runtime, the installed Agent SDK dependency tree and its Claude binary, the Native CLI with its SDK payload, and a compatible Zig toolchain. The Native SDK packager does not assemble this toolchain automatically. A custom post-package step must place those items in the final bundle and make the app resolve them relative to its bundle rather than from `PATH` or a developer home directory.

This is the documented Node path. A different self-contained JavaScript runtime or ahead-of-time sidecar build could replace Node only after compatibility with the Agent SDK and its bundled Claude binary is demonstrated on a clean Mac.

The safest bundle layout places helper executables under `Contents/Helpers` or `Contents/MacOS`, libraries under `Contents/Frameworks`, and ordinary data under `Contents/Resources`. Apple warns that putting code in the wrong location can work during development yet fail code signing or notarization.[^apple-bundles] Any generated projects and outputs should live in Application Support or another user-writable directory, not inside the signed app bundle.

### Signing and notarization are required for a clean downloaded launch

Native SDK supports `none`, `adhoc`, and named-identity signing. The distribution command is:

```bash
native package --target macos \
  --signing identity \
  --identity "Developer ID Application: Your Name"
```

Identity signing in Native SDK enables the hardened runtime, accepts an entitlements file, and verifies the result with a strict deep signature check.[^native-signing-source] Native SDK's signing guide then submits the archive using `xcrun notarytool` and staples the accepted ticket to the app.[^native-signing]

Apple requires every distributed executable to have a valid Developer ID signature, hardened runtime, and a secure timestamp before notarization. Nested helpers and tools must be signed before the outer app so the outer signature records their signatures.[^apple-notarization][^apple-signing] The complete bundle must be assembled before the final inside-out signing pass; modifying a resource or inserting a helper afterward breaks the outer seal.

An ad-hoc signed app downloaded through a browser is blocked on first launch with the standard unverifiable-developer warning and requires the judge to Control-click or right-click and choose Open. Native SDK notes that an ad-hoc app copied through a channel that does not add quarantine can launch directly, but that behavior should not be used as the submission contract.[^native-signing] A Developer ID-signed, notarized, and stapled package avoids the Security Settings workaround. macOS may still show its normal first-open confirmation for a downloaded app, which is a launch confirmation rather than credential or dependency setup.

### Preconditions that can block the submission

Confirm these before treating the package as deliverable:

- An active Apple Developer team, a usable `Developer ID Application` identity in the build Mac's keychain, and notarization credentials are available. Without them, a browser-downloaded app cannot meet the no-Security-Settings requirement.
- The Anthropic organization can create a non-default workspace, set its limits, fund API usage, and create an API key with the desired expiration.
- The one-day access window can be created close enough to judging. API key expiration cannot be extended, so a key minted for an earlier submission upload can expire before evaluation.
- The final app bundle has room for the local runtime and compiler payload, and all of it can be signed with the required hardened-runtime entitlements. This must be measured from the actual archive rather than estimated from the small Native UI binary.
- Judging permits outbound HTTPS to the chosen proxy or `api.anthropic.com`. Bundling the local tools removes installation dependencies, but Claude generation still requires network access.

## Recommended submission contract

Use these acceptance criteria for the distributable:

1. The app runs on a clean Apple silicon Mac with no Node, Bun, Zig, Native SDK CLI, Claude CLI, or project checkout installed.
2. The judge is never asked for an Anthropic account, API key, terminal command, or macOS Security Settings override.
3. The app is assembled, Developer ID-signed, notarized, stapled, and archived only after all helper executables and toolchains are in their final bundle locations.
4. Claude access is through a dedicated non-default workspace with restrictive spend and rate limits.
5. Preferred: the app uses an event-only capability to reach a credential-injecting proxy, and both the capability and the upstream one-day API key expire after judging.
6. If a backend is rejected: the package uses a one-day workspace API key, displays a clear expired-access state on `401`, and the team accepts that the key is extractable during its lifetime.
7. Verification happens on a clean macOS account with quarantine preserved. Check `codesign --verify --deep --strict`, Gatekeeper assessment, notarization ticket presence, first launch, one generation run, one generated-app build and launch, and the expired-credential error path.

## Bottom line

The build is feasible. The secure and judge-friendly answer is a notarized self-contained app plus a temporary credential-injecting proxy; the no-backend answer is a deliberately exposed one-day workspace key whose server-enforced expiry and workspace limits bound, but do not remove, the risk.

[^anthropic-auth]: Anthropic, [Authentication](https://platform.claude.com/docs/en/manage-claude/authentication), especially "API keys" and "Key expiration".
[^agent-quickstart]: Anthropic, [Claude Agent SDK quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart), especially prerequisites, bundled Claude Code binary, API key setup, and third-party authentication restrictions.
[^anthropic-secure]: Anthropic, [Securely deploying AI agents](https://code.claude.com/docs/en/agent-sdk/secure-deployment), especially "Credential management" and `ANTHROPIC_BASE_URL` proxy configuration.
[^workspaces]: Anthropic, [Workspaces](https://platform.claude.com/docs/en/manage-claude/workspaces), especially API key scoping and workspace spend/rate limits.
[^wif]: Anthropic, [Workload Identity Federation reference](https://platform.claude.com/docs/en/manage-claude/wif-reference), especially token exchange, credential precedence, and Agent SDK profile support.
[^app-attest]: Anthropic, [App Attest for iOS and macOS apps](https://platform.claude.com/docs/en/manage-claude/app-attest), especially platform requirements, one-hour token scope, and revocation.
[^native-credentials]: Native SDK, [Builtin Commands](https://native-sdk.dev/docs/bridge/builtin-commands), "Credential Commands".
[^native-packaging]: Native SDK, [Packaging](https://native-sdk.dev/docs/packaging), especially the macOS app bundle layout and platform status.
[^native-quickstart]: Native SDK, [Quick Start](https://native-sdk.dev/docs/quick-start), especially build prerequisites and pinned Zig toolchain behavior.
[^native-packages]: Native SDK, [Where Packages Go](https://native-sdk.dev/docs/typescript/packages), especially "Node as a worker".
[^native-signing]: Native SDK, [Code Signing](https://native-sdk.dev/docs/packaging/signing), especially Gatekeeper behavior, notarization, and nested Chromium signing guidance.
[^native-signing-source]: Native SDK, [`src/tooling/codesign.zig`](https://github.com/vercel-labs/native/blob/main/src/tooling/codesign.zig#L113-L133), identity signing and strict verification implementation.
[^apple-notarization]: Apple, [Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), especially notarization prerequisites and Gatekeeper tickets.
[^apple-signing]: Apple, [Code Signing Tasks](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Procedures/Procedures.html), especially "What to Code Sign" and nested code signing order.
[^apple-bundles]: Apple, [Placing content in a bundle](https://developer.apple.com/documentation/bundleresources/placing-content-in-a-bundle), especially standard locations for helper tools, frameworks, and resources.
