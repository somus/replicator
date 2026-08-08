# H1 packaged-toolchain gate: PASS

Observed on macOS 26.3.1 arm64 on 2026-08-08.

The ad-hoc signed arm64 outer `Replicator.app` resolved every runtime path from `Contents/Resources` with no global development tool on `PATH`. It ran the NDJSON echo worker, validated and built the probe Utility in a fresh Application Support-like data root, packaged a standalone ad-hoc signed `.app`, launched it with `NSWorkspace`, found its running process, and captured `utility-launched.png` while it was visible.

## Final command

```sh
scripts/assemble-release.sh /private/tmp/replicator-h1-package-run6
REPLICATOR_PROBE_DATA_ROOT=/private/tmp/replicator-h1-probe-data-run6-gui \
  /private/tmp/replicator-h1-package-run6/Replicator.app/Contents/MacOS/Replicator
```

The second command required GUI permission because it launches the standalone Utility and invokes `/usr/sbin/screencapture`. Its exit code was 0.

## Results

- Node.js: `v24.18.1`, `Mach-O 64-bit executable arm64`.
- Native CLI/SDK: `0.8.1`, commit `b21849c`, automation protocol `0x096c8aa4730c11ec`; CLI binary is arm64.
- Zig: `0.16.0`, `Mach-O 64-bit executable arm64`.
- Echo: `{"kind":"echoed","value":"packaged-worker-ok"}`.
- Native check: exit 0 in 1.074 seconds.
- ReleaseFast Utility build: exit 0 in 86.621 seconds.
- Standalone Utility package: exit 0 in 0.273 seconds, including ad-hoc sign and verification.
- Launch: `NSWorkspace` returned in 0.114 seconds; PID 18328 remained live through screenshot capture.
- Screenshot capture: exit 0 in 0.290 seconds. The retained 1,040 x 705 window-only crop is 46,317 bytes and excludes unrelated desktop content.
- Total outer probe: 91.850 seconds.
- Outer package size: 735 MB.
- Standalone Utility size: 5.6 MB.

The full bounded transcript is in `outer-probe.log`; architectures, hashes, and signing verification are in `verification.txt`.
