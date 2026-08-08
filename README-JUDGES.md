# Replicator judge instructions

Extract `Replicator.zip`, then Control-click `Replicator.app` and choose **Open**. The package includes arm64 Node.js 24.18.1, Agent SDK 0.3.226, the complete Native CLI/SDK 0.8.1 npm payload, Zig 0.16.0, the compiled worker, frozen Native guidance, and the clearly labelled Focus Sprint Prepared Demo. It does not require global development tools, Bun, a Claude login, or a development checkout.

Replicator stores its registry, generated source, Native SDK state, logs, evidence, and Ready Artifacts under `~/Library/Application Support/Replicator`. On the first launch, the clearly labelled Focus Sprint Prepared Demo is copied there atomically only when no registry or owner data exists. Later launches never overwrite owner data, and the signed application bundle remains read-only at runtime.

To assemble from repository source and the verified Prepared Demo data:

```sh
npm run build:worker
scripts/seed-prepared-demo.sh VERIFIED_PREPARED_ROOT SANITIZED_PREPARED_ROOT
scripts/assemble-release.sh OUTPUT_ROOT dist/worker SANITIZED_PREPARED_ROOT [RUNTIME_NODE_MODULES]
probe/verify-release.sh OUTPUT_ROOT FRESH_PROBE_HOME
```

The sanitizer retains the Focus Sprint registry, current source, accepted plan, reference image, exact revised Ready Artifact, evidence, screenshots, digests, and final attestation. It excludes Agent SDK transcripts, caches, dependencies, failed attempts, development logs, commands, and snapshots.

The assembler verifies the frozen 96-page official-docs mirror and the five Native 0.8.1 skills, runs Native test, validate, doctor, build, and package, and leaves final signing and verification to `native package --signing adhoc`. It then creates `Replicator.zip` with macOS metadata preserved and records its SHA-256. It does not hand-write `Info.plist` or manually sign nested code.
