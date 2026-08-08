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

usage() {
  cat >&2 <<'USAGE'
usage:
  scripts/assemble-release.sh OUTPUT_ROOT
  scripts/assemble-release.sh OUTPUT_ROOT BUILDER_APP COMPILED_WORKER_DIR UTILITY_APP [RUNTIME_NODE_MODULES]

One argument retains the H1 packaged-toolchain probe. Release assembly requires
the built outer app, compiled worker directory (including index.js), and verified
standalone Utility app as explicit inputs. RUNTIME_NODE_MODULES may point at a
production-only node_modules directory; otherwise npm creates one from the lockfile.
USAGE
  exit 64
}

require_directory() {
  [ -d "$1" ] || {
    echo "required directory is missing: $1" >&2
    exit 1
  }
}

prepare_toolchains() {
  destination=$1
  extraction_root=$2

  mkdir -p "$download_root" "$destination"
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

  native_binary="$native_cli_source/node_modules/@native-sdk/cli-darwin-arm64/bin/native"
  [ "$("$native_binary" --version | awk '{ print $2 }')" = "$native_version" ] || {
    echo "Native CLI must be ${native_version}" >&2
    exit 1
  }
  [ "$("$zig_source/zig" version)" = "$zig_version" ] || {
    echo "Zig must be ${zig_version}" >&2
    exit 1
  }

  tar -xzf "$download_root/$node_archive" -C "$extraction_root"
  mv "$extraction_root/node-v${node_version}-darwin-arm64" "$destination/node"
  ditto "$native_cli_source" "$destination/native-cli"
  ditto "$zig_source" "$destination/zig"
}

sign_macho_files() {
  root=$1
  find "$root" -type f -perm -111 -print | while IFS= read -r candidate; do
    if file "$candidate" | grep -q 'Mach-O'; then
      codesign --force --sign - "$candidate"
    fi
  done
}

sign_nested_apps() {
  root=$1
  find -d "$root" -type d -name '*.app' -print | while IFS= read -r nested_app; do
    codesign --force --sign - "$nested_app"
    codesign --verify --deep --strict --verbose=2 "$nested_app"
  done
}

assemble_h1_probe() {
  output_root=$1
  app="$output_root/Replicator.app"
  [ ! -e "$output_root" ] || {
    echo "output root already exists: choose a fresh path" >&2
    exit 1
  }

  staging=$(mktemp -d "${temporary_root%/}/replicator-h1-assembly.XXXXXX")
  staged_app="$staging/Replicator.app"
  staged_resources="$staged_app/Contents/Resources"
  mkdir -p "$staged_app/Contents/MacOS" "$staged_resources/toolchains" "$output_root"
  prepare_toolchains "$staged_resources/toolchains" "$staging"
  ditto "$repo_root/probe" "$staged_resources/probe"

  mkdir -p "$staging/module-cache"
  CLANG_MODULE_CACHE_PATH="$staging/module-cache" SWIFT_MODULECACHE_PATH="$staging/module-cache" \
    xcrun swiftc -O -target arm64-apple-macos14.0 \
      -framework AppKit "$repo_root/probe/outer/main.swift" \
      -o "$staged_app/Contents/MacOS/Replicator"

  cat > "$staged_app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>Replicator</string>
  <key>CFBundleIdentifier</key><string>dev.replicator.h1-package-probe.outer</string>
  <key>CFBundleName</key><string>Replicator</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST

  chmod +x "$staged_app/Contents/MacOS/Replicator"
  sign_macho_files "$staged_resources"
  codesign --force --sign - "$staged_app"
  codesign --verify --deep --strict --verbose=2 "$staged_app"
  mv "$staged_app" "$app"
  echo "$app"
}

assemble_release() {
  output_root=$1
  builder_app=$2
  worker_input=$3
  utility_app=$4
  runtime_modules=${5:-}

  require_directory "$builder_app"
  require_directory "$builder_app/Contents/MacOS"
  require_directory "$worker_input"
  require_directory "$utility_app"
  [ -f "$worker_input/index.js" ] || {
    echo "compiled worker input must contain index.js" >&2
    exit 1
  }
  [ ! -e "$output_root" ] || {
    echo "output root already exists: choose a fresh path" >&2
    exit 1
  }

  staging=$(mktemp -d "${temporary_root%/}/replicator-release-assembly.XXXXXX")
  staged_app="$staging/Replicator.app"
  staged_resources="$staged_app/Contents/Resources"
  mkdir -p "$output_root"
  ditto "$builder_app" "$staged_app"
  for managed_resource in toolchains worker templates reference-images 'Prepared Demo'; do
    if [ -e "$staged_resources/$managed_resource" ]; then
      find "$staged_resources/$managed_resource" -depth -delete
    fi
  done
  mkdir -p "$staged_resources/toolchains" "$staged_resources/worker" "$staged_resources/templates" "$staged_resources/reference-images" "$staged_resources/Prepared Demo"
  prepare_toolchains "$staged_resources/toolchains" "$staging"
  ditto "$worker_input" "$staged_resources/worker"
  ditto "$repo_root/templates/native-bounded" "$staged_resources/templates/native-bounded"
  cp "$repo_root/demo-prototype/focus-sprint-reference-dark.png" "$staged_resources/reference-images/focus-sprint-reference-dark.png"
  ditto "$utility_app" "$staged_resources/Prepared Demo/Focus Sprint.app"
  cp "$repo_root/packaging/runtime-versions.json" "$staged_resources/runtime-versions.json"

  builder_executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$staged_app/Contents/Info.plist")
  [ -n "$builder_executable" ] && [ "$builder_executable" != "ReplicatorBuilder" ] || {
    echo "builder executable name is unavailable or reserved" >&2
    exit 1
  }
  mv "$staged_app/Contents/MacOS/$builder_executable" "$staged_app/Contents/MacOS/ReplicatorBuilder"
  mkdir -p "$staging/module-cache"
  CLANG_MODULE_CACHE_PATH="$staging/module-cache" SWIFT_MODULECACHE_PATH="$staging/module-cache" \
    xcrun swiftc -O -target arm64-apple-macos14.0 \
      -framework AppKit "$repo_root/probe/release-launcher/main.swift" \
      -o "$staged_app/Contents/MacOS/$builder_executable"

  if [ -n "$runtime_modules" ]; then
    require_directory "$runtime_modules"
    ditto "$runtime_modules" "$staged_resources/worker/node_modules"
  else
    cp "$repo_root/package.json" "$repo_root/package-lock.json" "$staged_resources/worker/"
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix "$staged_resources/worker"
  fi

  packaged_sdk_version=$(node -p "require('$staged_resources/worker/node_modules/@anthropic-ai/claude-agent-sdk/package.json').version")
  [ "$packaged_sdk_version" = "$agent_sdk_version" ] || {
    echo "Agent SDK must be ${agent_sdk_version}" >&2
    exit 1
  }

  chmod +x "$staged_resources/toolchains/node/bin/node" \
    "$staged_resources/toolchains/native-cli/node_modules/@native-sdk/cli-darwin-arm64/bin/native" \
    "$staged_resources/toolchains/zig/zig"
  sign_macho_files "$staged_app/Contents"
  sign_nested_apps "$staged_resources"
  codesign --force --sign - "$staged_app"
  codesign --verify --deep --strict --verbose=2 "$staged_app"

  mv "$staged_app" "$output_root/Replicator.app"
  ditto -c -k --sequesterRsrc --keepParent "$output_root/Replicator.app" "$output_root/Replicator.zip"
  (cd "$output_root" && shasum -a 256 Replicator.zip > SHA256SUMS.txt)
  echo "$output_root/Replicator.app"
  echo "$output_root/Replicator.zip"
}

case $# in
  1) assemble_h1_probe "$1" ;;
  4) assemble_release "$1" "$2" "$3" "$4" ;;
  5) assemble_release "$1" "$2" "$3" "$4" "$5" ;;
  *) usage ;;
esac
