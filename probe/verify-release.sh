#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: probe/verify-release.sh RELEASE_ROOT FRESH_PROBE_HOME" >&2
  exit 64
fi

release_root=$1
probe_home=$2
app="$release_root/Replicator.app"
assets="$app/Contents/Resources"
node="$assets/toolchains/node/bin/node"
native="$assets/toolchains/native-cli/bin/native.js"
zig="$assets/toolchains/zig/zig"
worker="$assets/worker/index.js"
picker="$assets/bin/ReferencePicker"
launcher="$app/Contents/MacOS/replicator"
data_root="$probe_home/Library/Application Support/Replicator"

[ ! -e "$probe_home" ] || {
  echo "probe home already exists: choose a fresh path" >&2
  exit 1
}
mkdir -p "$data_root" "$probe_home/tmp" "$probe_home/native-home" "$probe_home/native-logs"

clean_env() {
  env -i HOME="$probe_home" PATH="$assets/toolchains/node/bin:$assets/toolchains/zig:/usr/bin:/bin:/usr/sbin:/sbin" \
    TMPDIR="$probe_home/tmp" REPLICATOR_RESOURCES_ROOT="$assets" REPLICATOR_DATA_ROOT="$data_root" \
    REPLICATOR_PICKER_PATH="$picker" REPLICATOR_NODE_PATH="$node" REPLICATOR_WORKER_PATH="$worker" \
    REPLICATOR_NATIVE_PATH="$native" REPLICATOR_TEMPLATE_ROOT="$assets/templates" \
    NATIVE_SDK_HOME="$probe_home/native-home" NATIVE_SDK_ZIG="$zig" NATIVE_SDK_LOG_DIR="$probe_home/native-logs" "$@"
}

[ "$(clean_env "$node" --version)" = "v24.18.1" ]
[ "$(clean_env "$zig" version)" = "0.16.0" ]
clean_env "$node" "$native" version | grep -q '^native 0\.8\.1 (commit b21849c, automation protocol 0x096c8aa4730c11ec)$'
[ "$(clean_env "$node" -p "require('$assets/worker/node_modules/@anthropic-ai/claude-agent-sdk/package.json').version")" = "0.3.226" ]
clean_env "$node" "$worker" </dev/null
clean_env "$node" -e 'const fs=require("fs");const value=JSON.parse(fs.readFileSync(process.argv[1]));if(value.pageCount!==96||value.componentPageCount!==48)process.exit(1)' "$assets/native-docs/index.json"
clean_env "$node" -e 'const fs=require("fs");const value=JSON.parse(fs.readFileSync(process.argv[1]));if(value.native.version!=="0.8.1"||value.skillCount!==5)process.exit(1)' "$assets/native-skills/0.8.1/manifest.json"

picker_dismiss=$(clean_env "$picker" --probe-dismiss)
printf '%s\n' "$picker_dismiss" | grep -q '"type":"done"'
printf '%s\n' "$picker_dismiss" | grep -q '"count":0'
picker_four=$(clean_env "$picker" --probe-paths /tmp/one.png /tmp/two.jpg /tmp/three.jpeg /tmp/four.webp)
[ "$(printf '%s\n' "$picker_four" | wc -l | tr -d ' ')" = "5" ]
printf '%s\n' "$picker_four" | tail -1 | grep -q '"type":"done"'
long_path=$(/usr/bin/printf '/tmp/%03070d.png' 0)
if clean_env "$picker" --probe-paths "$long_path" > "$probe_home/picker-overlong.json"; then
  echo "picker accepted an overlong output line" >&2
  exit 1
fi
grep -q 'selected path exceeds output limit' "$probe_home/picker-overlong.json"
clean_env "$picker" > "$probe_home/picker-cancel.out" &
picker_pid=$!
kill "$picker_pid" 2>/dev/null || true
wait "$picker_pid" 2>/dev/null || true

codesign --verify --deep --strict --verbose=2 "$app"
codesign --verify --deep --strict --verbose=2 "$assets/prepared-demo/Focus Sprint.app"
(
  cd "$release_root"
  shasum -a 256 -c SHA256SUMS.txt
)

if [ "${REPLICATOR_VERIFY_GUI:-0}" = "1" ]; then
  clean_env "$launcher" > "$probe_home/launcher.out" 2> "$probe_home/launcher.err" &
  launcher_pid=$!
  cleanup() {
    kill "$launcher_pid" 2>/dev/null || true
    wait "$launcher_pid" 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM
  kill -0 "$launcher_pid"
  cleanup
  trap - EXIT INT TERM
fi

echo "release_probe=PASS"
echo "data_root=Library/Application Support/Replicator"
echo "path=bundle-relative-plus-system"
echo "claude_login=not_used"
echo "bun=not_used"
