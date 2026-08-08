# Replicator judge instructions

Extract `Replicator.zip`, then Control-click `Replicator.app` and choose **Open**. The package includes arm64 Node.js 24.18.1, Agent SDK 0.3.226, the complete Native CLI/SDK 0.8.1 npm payload, Zig 0.16.0, the compiled worker, frozen Native guidance, and the clearly labelled Focus Sprint Prepared Demo. It does not require global development tools, Bun, a Claude login, or a development checkout.

Replicator stores its registry, generated source, Native SDK state, logs, evidence, and Ready Artifacts under `~/Library/Application Support/Replicator`. The signed application bundle remains read-only at runtime. The packaging stage does not persist a credential.

To assemble from repository source, a compiled worker, and a verified Prepared Demo app:

```sh
npm run build:worker
scripts/assemble-release.sh OUTPUT_ROOT dist/worker VERIFIED_FOCUS_SPRINT_APP [RUNTIME_NODE_MODULES]
probe/verify-release.sh OUTPUT_ROOT FRESH_PROBE_HOME
```

The assembler verifies the frozen 96-page official-docs mirror and the five Native 0.8.1 skills, runs Native test, validate, doctor, build, and package, and leaves final signing and verification to `native package --signing adhoc`. It then creates `Replicator.zip` with macOS metadata preserved and records its SHA-256. It does not hand-write `Info.plist` or manually sign nested code.

The retained H1 package evidence is in `evidence/h1-package-probe/`. Updated package evidence is in `evidence/h3-package-continuity/`.
