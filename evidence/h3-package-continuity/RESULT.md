# H3:30 packaging continuity: PASS

Observed on macOS arm64 on 2026-08-08. The release assembler accepted an outer builder app, compiled worker directory, and standalone Utility app as explicit inputs. This packaging-only check used the small release-builder fixture and the retained H1 standalone Utility; integration must rerun the same command with the final builder and verified Focus Sprint Utility.

## Results

- Final `Contents/Resources` pins Node.js 24.18.1, Agent SDK 0.3.226, Native 0.8.1, and Zig 0.16.0 in `runtime-versions.json`.
- The outer executable and all four runtime executables are arm64 Mach-O files.
- Nested Mach-O executables and the standalone Utility app were ad-hoc signed before the outer app. Deep strict verification passed before ZIP creation and again after extraction.
- `Replicator.zip` was created with `ditto --sequesterRsrc --keepParent`; SHA-256 is `dcf7533726aa8c0d281b503153e0ee8830d364d537aceea47c1e66d2e9fa1707`.
- The compiled worker loaded the packaged Agent SDK and cleanly handled EOF with an empty environment, no Claude login, no credential, no Bun, and `PATH=/usr/bin:/bin:/usr/sbin:/sbin`.
- The assembled outer app launched with the same minimized `PATH` and wrote its probe marker only under `Library/Application Support/Replicator`.
- Literal scans found no Anthropic key, source checkout path, or user home path in the final app or checksum file.
- Generated apps, ZIPs, runtime caches, and production dependencies remained in an ephemeral workspace and are not retained in the repository.

## Verification

```sh
sh -n scripts/assemble-release.sh
sh -n probe/verify-release.sh
npm run build:worker
scripts/assemble-release.sh RELEASE_ROOT BUILDER_APP dist/worker UTILITY_APP RUNTIME_NODE_MODULES
probe/verify-release.sh RELEASE_ROOT FRESH_PROBE_DATA_ROOT
ditto -x -k Replicator.zip FRESH_EXTRACT_ROOT
codesign --verify --deep --strict --verbose=2 FRESH_EXTRACT_ROOT/Replicator.app
```

The retained H1 evidence remains unchanged in `evidence/h1-package-probe/`.
