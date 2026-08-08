# Replicator

Replicator is a cross-platform desktop app for creating and revising personal native utilities from natural-language requests.

The checked-in Native manifest currently enables macOS, and the included release assembler produces an Apple silicon macOS package.

## Prerequisites

- macOS on Apple silicon for the current build target
- Node.js 24.18.1 and npm
- Native CLI 0.8.1

Install the Native CLI with:

```sh
npm install -g @native-sdk/cli@0.8.1
```

Native uses Zig 0.16.0. If it isn't available on your `PATH`, the CLI offers to download the pinned version when you first run a development or build command.

## Run in development

Install the JavaScript dependencies, then start the Native development app:

```sh
npm ci
npm run dev
```

The development command builds and opens the app with markup hot reload. Stop it with `Ctrl+C`.

## Build

Compile the Node.js worker and the optimized Native app:

```sh
npm run build:worker
native build --yes -Dautomation=true
```

The worker is written to `dist/worker/`, and the app binary is written to `zig-out/bin/replicator`.

To create the current macOS distribution as `Replicator.app` and `Replicator.zip`, provide a fresh output directory and a verified Prepared Demo app:

```sh
scripts/assemble-release.sh OUTPUT_ROOT dist/worker VERIFIED_FOCUS_SPRINT_APP
```

The release assembler bundles the pinned runtime toolchain, validates the project, builds and signs the macOS app, and writes the ZIP and SHA-256 checksum under `OUTPUT_ROOT`. See [README-JUDGES.md](README-JUDGES.md) for instructions for running the packaged app.
