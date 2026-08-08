#!/bin/sh
set -eu

[ "$#" -eq 2 ] || {
  echo "usage: probe/verify-release.sh RELEASE_ROOT PROBE_DATA_ROOT" >&2
  exit 64
}

release_root=$1
data_root=$2
app="$release_root/Replicator.app"
resources="$app/Contents/Resources"
node="$resources/toolchains/node/bin/node"
native="$resources/toolchains/native-cli/bin/native.js"
zig="$resources/toolchains/zig/zig"
worker="$resources/worker/index.js"

[ ! -e "$data_root" ] || {
  echo "probe data root already exists: choose a fresh path" >&2
  exit 1
}
mkdir -p "$data_root/Library/Application Support/Replicator"

clean_env() {
  env -i \
    HOME="$data_root" \
    PATH=/usr/bin:/bin:/usr/sbin:/sbin \
    TMPDIR="$data_root/tmp" \
    REPLICATOR_DATA_ROOT="$data_root/Library/Application Support/Replicator" \
    "$@"
}

mkdir -p "$data_root/tmp"
[ "$(clean_env "$node" --version)" = "v24.18.1" ]
[ "$(clean_env "$zig" version)" = "0.16.0" ]
clean_env "$node" "$native" --version | grep -q '^native 0\.8\.1 '
[ "$(clean_env "$node" -p "require('$resources/worker/node_modules/@anthropic-ai/claude-agent-sdk/package.json').version")" = "0.3.226" ]
clean_env "$node" "$worker" </dev/null

codesign --verify --deep --strict --verbose=2 "$app"
codesign --verify --deep --strict --verbose=2 "$resources/Prepared Demo/Focus Sprint.app"
test -f "$release_root/Replicator.zip"
test -f "$release_root/SHA256SUMS.txt"
(cd "$release_root" && shasum -a 256 -c SHA256SUMS.txt)

echo "release_probe=PASS"
echo "data_root=Library/Application Support/Replicator"
echo "path=/usr/bin:/bin:/usr/sbin:/sbin"
echo "claude_login=not_used"
echo "bun=not_used"
