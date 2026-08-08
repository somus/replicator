#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
node_version=24.18.1
agent_sdk_version=0.3.226
native_version=0.8.1
zig_version=0.16.0
node_archive="node-v${node_version}-darwin-arm64.tar.gz"
temporary_root=${TMPDIR:-/tmp}
download_root=${REPLICATOR_DOWNLOAD_CACHE:-"${temporary_root%/}/replicator-downloads"}
native_cli_source=${NATIVE_CLI_SOURCE:-"/usr/local/lib/node_modules/@native-sdk/cli"}
zig_source=${ZIG_SOURCE:-"$HOME/.native/toolchains/zig-${zig_version}"}

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  echo "usage: scripts/assemble-release.sh OUTPUT_ROOT COMPILED_WORKER_DIR PREPARED_DEMO_APP [RUNTIME_NODE_MODULES]" >&2
  exit 64
fi

output_root=$1
worker_input=$2
prepared_demo=$3
runtime_modules=${4:-}

require_directory() {
  [ -d "$1" ] || {
    echo "required directory is missing: $1" >&2
    exit 1
  }
}

require_directory "$worker_input"
require_directory "$prepared_demo"
[ -f "$worker_input/index.js" ] || {
  echo "compiled worker input must contain index.js" >&2
  exit 1
}
[ ! -e "$output_root" ] || {
  echo "output root already exists: choose a fresh path" >&2
  exit 1
}

staging=$(mktemp -d "${temporary_root%/}/replicator-release-assembly.XXXXXX")
package_assets="$staging/package-assets"
toolchains="$package_assets/toolchains"
native_home="$staging/native-home"
module_cache="$staging/module-cache"
skills_capture="$staging/native-skills-0.8.1"
mkdir -p "$download_root" "$output_root" "$toolchains" "$native_home" "$module_cache" "$skills_capture"
mkdir -p "$staging/home" "$staging/zig-global-cache" "$staging/zig-local-cache" "$staging/native-logs"

if [ ! -f "$download_root/$node_archive" ]; then
  curl --fail --location --output "$download_root/$node_archive" "https://nodejs.org/dist/v${node_version}/${node_archive}"
fi
if [ ! -f "$download_root/SHASUMS256-${node_version}.txt" ]; then
  curl --fail --location --output "$download_root/SHASUMS256-${node_version}.txt" "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt"
fi
expected=$(awk -v archive="$node_archive" '$2 == archive { print $1 }' "$download_root/SHASUMS256-${node_version}.txt")
actual=$(shasum -a 256 "$download_root/$node_archive" | awk '{ print $1 }')
[ -n "$expected" ] && [ "$actual" = "$expected" ] || {
  echo "Node archive checksum mismatch" >&2
  exit 1
}

[ "$("$zig_source/zig" version)" = "$zig_version" ] || {
  echo "Zig must be ${zig_version}" >&2
  exit 1
}

tar -xzf "$download_root/$node_archive" -C "$staging"
mv "$staging/node-v${node_version}-darwin-arm64" "$toolchains/node"
ditto "$native_cli_source" "$toolchains/native-cli"
ditto "$zig_source" "$toolchains/zig"

bundled_node="$toolchains/node/bin/node"
bundled_native="$toolchains/native-cli/bin/native.js"
[ "$("$bundled_node" -p "require('$toolchains/native-cli/package.json').version")" = "$native_version" ] || {
  echo "Native CLI npm payload must be ${native_version}" >&2
  exit 1
}
[ "$("$bundled_node" -p "require('$toolchains/native-cli/node_modules/@native-sdk/cli-darwin-arm64/package.json').version")" = "$native_version" ] || {
  echo "Native arm64 optional dependency must be ${native_version}" >&2
  exit 1
}
native() {
  env PATH="$toolchains/zig:$toolchains/node/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
    HOME="$staging/home" ZIG_GLOBAL_CACHE_DIR="$staging/zig-global-cache" ZIG_LOCAL_CACHE_DIR="$staging/zig-local-cache" \
    NATIVE_SDK_HOME="$native_home" NATIVE_SDK_ZIG="$toolchains/zig/zig" NATIVE_SDK_LOG_DIR="$staging/native-logs" \
    "$bundled_node" "$bundled_native" "$@"
}

native version > "$skills_capture/version.txt"
native skills list > "$skills_capture/skills-list.txt"
native skills get native-ui > "$skills_capture/native-ui.md"
native skills get ts-core > "$skills_capture/ts-core.md"
native skills get automation > "$skills_capture/automation.md"
native skills get core --full > "$skills_capture/core-full.md"
native skills get zig > "$skills_capture/zig.md"
"$bundled_node" "$repo_root/scripts/sync-native-docs.mjs" --index-skills "$skills_capture" "$skills_capture/version.txt"
find "$skills_capture" -name version.txt -delete
"$bundled_node" "$repo_root/scripts/sync-native-docs.mjs" --verify-skills "$skills_capture"
"$bundled_node" "$repo_root/scripts/sync-native-docs.mjs" --verify-docs "$repo_root/resources/native-docs"

locked_skills_digest=$("$bundled_node" -p "JSON.parse(require('fs').readFileSync('$repo_root/resources/native-skills/0.8.1/manifest.json')).snapshotSha256")
captured_skills_digest=$("$bundled_node" -p "JSON.parse(require('fs').readFileSync('$skills_capture/manifest.json')).snapshotSha256")
[ "$captured_skills_digest" = "$locked_skills_digest" ] || {
  echo "captured Native skills differ from the reviewed 0.8.1 snapshot" >&2
  exit 1
}

mkdir -p "$package_assets/bin" "$package_assets/worker" "$package_assets/templates" \
  "$package_assets/native-skills" "$package_assets/prepared-demo/data"
ditto "$worker_input" "$package_assets/worker"
ditto "$repo_root/templates/native-bounded" "$package_assets/templates/native-bounded"
ditto "$repo_root/resources/native-docs" "$package_assets/native-docs"
ditto "$skills_capture" "$package_assets/native-skills/0.8.1"
ditto "$prepared_demo" "$package_assets/prepared-demo/data"
prepared_registry="$package_assets/prepared-demo/data/registry.json"
prepared_artifact_rel=$(
  "$bundled_node" -e '
    const fs = require("fs");
    const registry = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (registry.version !== 1 || registry.utilities.length !== 1) process.exit(1);
    const utility = registry.utilities[0];
    if (utility.id !== "focus-sprint" || utility.state !== "ready" || !utility.readyArtifact) process.exit(1);
    process.stdout.write(utility.readyArtifact.path);
  ' "$prepared_registry"
)
[ "$prepared_artifact_rel" = "utilities/focus-sprint/artifacts/d55e6460-01b9-40d3-82ea-efbf3ea8717d/Generated App.app" ] || {
  echo "Prepared Demo registry does not select the exact verified revised artifact" >&2
  exit 1
}
prepared_artifact="$package_assets/prepared-demo/data/$prepared_artifact_rel"
[ -d "$prepared_artifact" ] || {
  echo "Prepared Demo exact verified revised artifact is missing" >&2
  exit 1
}
mv "$prepared_artifact" "$package_assets/prepared-demo/Focus Sprint.app"
rmdir "$(dirname "$prepared_artifact")"
cp "$repo_root/packaging/runtime-versions.json" "$package_assets/runtime-versions.json"

if [ -n "$runtime_modules" ]; then
  require_directory "$runtime_modules"
  ditto "$runtime_modules" "$package_assets/worker/node_modules"
else
  cp "$repo_root/package.json" "$repo_root/package-lock.json" "$package_assets/worker/"
  env HOME="$staging/home" PATH="$toolchains/node/bin:/usr/bin:/bin:/usr/sbin:/sbin" npm_config_cache="$staging/npm-cache" \
    "$toolchains/node/bin/npm" install --omit=dev --ignore-scripts --no-audit --no-fund --prefix "$package_assets/worker"
fi

packaged_sdk_version=$("$bundled_node" -p "require('$package_assets/worker/node_modules/@anthropic-ai/claude-agent-sdk/package.json').version")
[ "$packaged_sdk_version" = "$agent_sdk_version" ] || {
  echo "Agent SDK must be ${agent_sdk_version}" >&2
  exit 1
}

CLANG_MODULE_CACHE_PATH="$module_cache" SWIFT_MODULECACHE_PATH="$module_cache" \
  xcrun swiftc -O -target arm64-apple-macos14.0 -framework AppKit \
    "$repo_root/host/launcher.swift" -o "$staging/ReplicatorLauncher"
CLANG_MODULE_CACHE_PATH="$module_cache" SWIFT_MODULECACHE_PATH="$module_cache" \
  xcrun swiftc -O -target arm64-apple-macos14.0 -framework AppKit -framework UniformTypeIdentifiers \
    "$repo_root/host/reference-picker.swift" -o "$package_assets/bin/ReferencePicker"

(
  cd "$repo_root"
  native test --yes
  native validate app.zon
  native doctor --manifest app.zon --strict
  native build --yes -Dautomation=true
)

builder_binary="$repo_root/zig-out/bin/replicator"
[ -x "$builder_binary" ] || {
  echo "Native build did not produce zig-out/bin/replicator" >&2
  exit 1
}
cp "$builder_binary" "$package_assets/bin/ReplicatorBuilder"

# Native 0.8.1's asset indexer intentionally caps one asset at 16 MiB,
# while the pinned Node, Agent SDK, and Zig executables are larger. Let
# Native create the bundle, stage the immutable runtime before signing,
# then let a final Native package invocation own the signature and verify it.
mkdir -p "$staging/empty-assets"
(
  cd "$repo_root"
  native package --target macos --output "$output_root/Replicator.app" \
    --binary "$staging/ReplicatorLauncher" --assets "$staging/empty-assets" --signing none
)
ditto "$package_assets" "$output_root/Replicator.app/Contents/Resources"
(
  cd "$repo_root"
  native package --target macos --output "$output_root/Replicator.app" \
    --binary "$staging/ReplicatorLauncher" --assets "$staging/empty-assets" --signing adhoc
)

codesign --verify --deep --strict --verbose=2 "$output_root/Replicator.app"
"$bundled_node" "$repo_root/scripts/sync-native-docs.mjs" --verify-docs "$output_root/Replicator.app/Contents/Resources/native-docs"
"$bundled_node" "$repo_root/scripts/sync-native-docs.mjs" --verify-skills "$output_root/Replicator.app/Contents/Resources/native-skills/0.8.1"

if rg -a -l -e 'sk-ant-[A-Za-z0-9_-]{12,}|sk-ant-api[0-9A-Za-z_-]+' "$output_root/Replicator.app" > "$staging/secret-scan.txt"; then
  echo "release contains a credential-like value" >&2
  exit 1
fi
if rg -a -F -l -e "${repo_root%/}/" -e "${HOME%/}/" -e "${staging%/}/" \
  "$output_root/Replicator.app" > "$staging/path-scan.txt"; then
  echo "release contains a development checkout, home, or assembly path" >&2
  exit 1
fi

ditto -c -k --sequesterRsrc --keepParent "$output_root/Replicator.app" "$output_root/Replicator.zip"
(
  cd "$output_root"
  shasum -a 256 Replicator.zip > SHA256SUMS.txt
)
echo "$output_root/Replicator.app"
echo "$output_root/Replicator.zip"
