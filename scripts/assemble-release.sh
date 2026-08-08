#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
output_root=${1:-"$repo_root/packaging/h1"}
app="$output_root/Replicator.app"
resources="$app/Contents/Resources"
node_version=24.18.1
node_archive="node-v${node_version}-darwin-arm64.tar.gz"
download_root=${REPLICATOR_DOWNLOAD_CACHE:-"/private/tmp/replicator-downloads"}
native_cli_source=${NATIVE_CLI_SOURCE:-"/usr/local/lib/node_modules/@native-sdk/cli"}
zig_source=${ZIG_SOURCE:-"$HOME/.native/toolchains/zig-0.16.0"}

[ ! -e "$output_root" ] || {
  echo "output root already exists: choose a fresh path" >&2
  exit 1
}
mkdir -p "$download_root" "$output_root"

if [ ! -f "$download_root/$node_archive" ]; then
  curl --fail --location --output "$download_root/$node_archive" "https://nodejs.org/dist/v${node_version}/${node_archive}"
fi
curl --fail --location --output "$download_root/SHASUMS256.txt" "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt"
expected=$(awk -v archive="$node_archive" '$2 == archive { print $1 }' "$download_root/SHASUMS256.txt")
actual=$(shasum -a 256 "$download_root/$node_archive" | awk '{ print $1 }')
[ -n "$expected" ] && [ "$actual" = "$expected" ] || {
  echo "Node archive checksum mismatch" >&2
  exit 1
}

[ "$("$native_cli_source/node_modules/@native-sdk/cli-darwin-arm64/bin/native" --version | awk '{ print $2 }')" = "0.8.1" ]
[ "$("$zig_source/zig" version)" = "0.16.0" ]

staging=$(mktemp -d /private/tmp/replicator-assembly.XXXXXX)
mkdir -p "$staging/Replicator.app/Contents/MacOS" "$staging/Replicator.app/Contents/Resources/toolchains"
staged_app="$staging/Replicator.app"
staged_resources="$staged_app/Contents/Resources"

tar -xzf "$download_root/$node_archive" -C "$staging"
mv "$staging/node-v${node_version}-darwin-arm64" "$staged_resources/toolchains/node"
cp -R "$native_cli_source" "$staged_resources/toolchains/native-cli"
cp -R "$zig_source" "$staged_resources/toolchains/zig"
cp -R "$repo_root/probe" "$staged_resources/probe"

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

chmod +x "$staged_app/Contents/MacOS/Replicator" \
  "$staged_resources/toolchains/node/bin/node" \
  "$staged_resources/toolchains/native-cli/node_modules/@native-sdk/cli-darwin-arm64/bin/native" \
  "$staged_resources/toolchains/zig/zig"

codesign --force --sign - "$staged_resources/toolchains/node/bin/node"
codesign --force --sign - "$staged_resources/toolchains/native-cli/node_modules/@native-sdk/cli-darwin-arm64/bin/native"
codesign --force --sign - "$staged_resources/toolchains/zig/zig"
codesign --force --deep --sign - "$staged_app"
codesign --verify --deep --strict --verbose=2 "$staged_app"

mv "$staged_app" "$app"
echo "$app"
