# Replicator judge instructions

The H1 packaged-toolchain checkpoint remains documented in `evidence/h1-package-probe/`. It proves bundle-relative Node.js 24.18.1, Native 0.8.1, and Zig 0.16.0 execution, a compiled worker round trip, and standalone Utility packaging and launch.

## Submission Package

Extract `Replicator.zip`, then Control-click `Replicator.app` and choose **Open**. Replicator includes Node.js 24.18.1, Agent SDK 0.3.226, Native 0.8.1, Zig 0.16.0, the compiled worker, and the verified Focus Sprint Prepared Demo. It does not use a global Node, Native, Zig, Bun, Claude login, or development checkout.

Replicator stores its registry, generated source, caches, evidence, and Ready Artifacts under `~/Library/Application Support/Replicator`. The signed application bundle is read-only at runtime. No credential is included by the packaging stage.

For the H3:30 packaging continuity check, assemble from fresh explicit artifacts and run the retained probe:

```sh
scripts/assemble-release.sh OUTPUT_ROOT BUILDER_APP COMPILED_WORKER_DIR UTILITY_APP [RUNTIME_NODE_MODULES]
probe/verify-release.sh OUTPUT_ROOT FRESH_PROBE_DATA_ROOT
```

The assembler signs nested Mach-O executables and Prepared Demo apps before the outer app, verifies the final signature, and creates `Replicator.zip` with macOS resource metadata preserved.
