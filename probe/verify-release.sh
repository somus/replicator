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
launcher="$app/Contents/MacOS/replicator"
builder_match="${app#/private}/Contents/MacOS/ReplicatorBuilder"

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
    REPLICATOR_NODE_PATH="$node" \
    REPLICATOR_WORKER_PATH="$worker" \
    REPLICATOR_NATIVE_PATH="$native" \
    REPLICATOR_TEMPLATE_ROOT="$resources/templates" \
    REPLICATOR_DATA_ROOT="$data_root/Library/Application Support/Replicator" \
    REPLICATOR_REFERENCE_JSON='[]' \
    "$@"
}

mkdir -p "$data_root/tmp"
[ "$(clean_env "$node" --version)" = "v24.18.1" ]
[ "$(clean_env "$zig" version)" = "0.16.0" ]
clean_env "$node" "$native" --version | grep -q '^native 0\.8\.1 '
[ "$(clean_env "$node" -p "require('$resources/worker/node_modules/@anthropic-ai/claude-agent-sdk/package.json').version")" = "0.3.226" ]
clean_env "$node" "$worker" </dev/null
test -f "$resources/templates/native-bounded/app.zon"
test -f "$resources/reference-images/focus-sprint-reference-dark.png"

codesign --verify --deep --strict --verbose=2 "$app"
codesign --verify --deep --strict --verbose=2 "$resources/Prepared Demo/Focus Sprint.app"
test -f "$release_root/Replicator.zip"
test -f "$release_root/SHA256SUMS.txt"
(cd "$release_root" && shasum -a 256 -c SHA256SUMS.txt)

clean_env "$launcher" >"$data_root/launch.out" 2>"$data_root/launch.err" &
launcher_pid=$!
builder_pid=
cleanup() {
  if [ -n "$builder_pid" ]; then
    kill "$builder_pid" 2>/dev/null || true
  fi
  kill "$launcher_pid" 2>/dev/null || true
  wait "$launcher_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
attempt=0
while [ "$attempt" -lt 50 ]; do
  builder_pid=$(pgrep -f "$builder_match" 2>/dev/null || true)
  if grep -q 'event="start"' "$data_root/launch.err" 2>/dev/null; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 0.1
done
[ "$attempt" -lt 50 ] || {
  echo "packaged builder did not launch" >&2
  exit 1
}
grep -q 'event="start"' "$data_root/launch.err"
test -f "$data_root/Library/Application Support/Replicator/utilities/focus-sprint/references/focus-sprint-reference-dark.png"
cleanup
trap - EXIT INT TERM

echo "release_probe=PASS"
echo "data_root=Library/Application Support/Replicator"
echo "path=/usr/bin:/bin:/usr/sbin:/sbin"
echo "claude_login=not_used"
echo "bun=not_used"
echo "outer_launch=PASS"
