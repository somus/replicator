#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: scripts/seed-prepared-demo.sh VERIFIED_PREPARED_ROOT CLEAN_DATA_ROOT" >&2
  exit 64
fi

source_root=$1
data_root=$2
node_bin=${NODE_BIN:-node}

[ -d "$source_root" ] || {
  echo "verified Prepared Demo root is missing" >&2
  exit 1
}
[ -f "$source_root/registry.json" ] || {
  echo "Prepared Demo registry is missing" >&2
  exit 1
}
[ ! -e "$data_root" ] || {
  echo "data root already exists: choose a clean path" >&2
  exit 1
}
if find "$source_root" -type l -print | grep -q .; then
  echo "Prepared Demo contains a symbolic link" >&2
  exit 1
fi
if rg -a -l -e 'sk-ant-[A-Za-z0-9_-]{12,}|sk-ant-api[0-9A-Za-z_-]+|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN' "$source_root" >/dev/null; then
  echo "Prepared Demo contains credential material" >&2
  exit 1
fi

ready_path=$(
  "$node_bin" -e '
    const fs = require("fs");
    const registry = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (registry.version !== 1 || registry.utilities.length !== 1) process.exit(1);
    const utility = registry.utilities[0];
    if (utility.id !== "focus-sprint" || utility.state !== "ready" || !utility.readyArtifact) process.exit(1);
    const value = utility.readyArtifact.path;
    if (typeof value !== "string" || value.startsWith("/") || value.split("/").some((part) => !part || part === "." || part === "..")) process.exit(1);
    process.stdout.write(value);
  ' "$source_root/registry.json"
)
[ -n "$ready_path" ] && [ -d "$source_root/$ready_path" ] || {
  echo "Prepared Demo Ready Artifact is missing" >&2
  exit 1
}

evidence_path=$(
  "$node_bin" -e '
    const fs = require("fs");
    const utility = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).utilities[0];
    process.stdout.write(utility.readyArtifact.evidencePath);
  ' "$source_root/registry.json"
)
[ -n "$evidence_path" ] && [ -d "$source_root/$evidence_path" ] || {
  echo "Prepared Demo evidence is missing" >&2
  exit 1
}

parent=$(dirname "$data_root")
mkdir -p "$parent"
staging=$(mktemp -d "$parent/.replicator-prepared.XXXXXX")
mkdir -p "$staging/utilities/focus-sprint"
cp "$source_root/registry.json" "$staging/registry.json"
cp "$source_root/registry.json" "$staging/registry.json.backup"
mkdir -p "$staging/utilities/focus-sprint/source"
for source_file in README.md app.zon package.json tsconfig.json; do
  [ -f "$source_root/utilities/focus-sprint/source/$source_file" ] && \
    cp "$source_root/utilities/focus-sprint/source/$source_file" "$staging/utilities/focus-sprint/source/$source_file"
done
ditto "$source_root/utilities/focus-sprint/source/src" "$staging/utilities/focus-sprint/source/src"
ditto "$source_root/utilities/focus-sprint/source/assets" "$staging/utilities/focus-sprint/source/assets"
ditto "$source_root/utilities/focus-sprint/references" "$staging/utilities/focus-sprint/references"
mkdir -p "$staging/$(dirname "$evidence_path")"
ditto "$source_root/$evidence_path" "$staging/$evidence_path"
mkdir -p "$staging/$(dirname "$ready_path")"
ditto "$source_root/$ready_path" "$staging/$ready_path"

if find "$staging" -type l -print | grep -q .; then
  echo "sanitized Prepared Demo contains a symbolic link" >&2
  exit 1
fi
if find "$staging" -type d \( -name node_modules -o -name agent-session -o -name native-home -o -name native-logs -o -name commands -o -name snapshots \) -print | grep -q .; then
  echo "sanitized Prepared Demo contains excluded private or development data" >&2
  exit 1
fi
if rg -a -l -e 'sk-ant-[A-Za-z0-9_-]{12,}|sk-ant-api[0-9A-Za-z_-]+|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN' "$staging" >/dev/null; then
  echo "sanitized Prepared Demo contains credential material" >&2
  exit 1
fi
mv "$staging" "$data_root"
echo "$data_root"
