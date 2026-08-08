# H1 packaged-toolchain probe

This checkpoint is a development probe, not the final Submission Package. It proves that an ad-hoc signed arm64 `Replicator.app` resolves Node.js 24.18.1, Native CLI/SDK 0.8.1, Zig 0.16.0, the echo worker, and the Utility template relative to `Contents/Resources`, then builds and launches a standalone Utility under an isolated Application Support-like data root.

Run from the repository root with fresh output paths:

```sh
scripts/assemble-release.sh packaging/h1
REPLICATOR_PROBE_DATA_ROOT="$PWD/packaging/h1-probe-data" \
  packaging/h1/Replicator.app/Contents/MacOS/Replicator
```

The retained H1 review evidence lives in `evidence/h1-package-probe/`. Writable Utility source, build caches, and the Ready Artifact remain outside the signed bundle under the selected probe data root.
