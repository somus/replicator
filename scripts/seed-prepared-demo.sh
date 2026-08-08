#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: scripts/seed-prepared-demo.sh VERIFIED_PREPARED_ROOT CLEAN_DATA_ROOT" >&2
  exit 64
fi

source_root=$1
data_root=$2
[ -d "$source_root" ] || {
  echo "verified Prepared Demo root is missing" >&2
  exit 1
}
[ -f "$source_root/registry.json" ] || {
  echo "Prepared Demo registry is missing" >&2
  exit 1
}
[ -d "$source_root/utilities/focus-sprint/ready/Focus Sprint.app" ] || {
  echo "Prepared Demo Ready Artifact is missing" >&2
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
if rg -a -l -e 'sk-ant-[A-Za-z0-9_-]{12,}|sk-ant-api[0-9A-Za-z_-]+' "$source_root" >/dev/null; then
  echo "Prepared Demo contains a credential-like value" >&2
  exit 1
fi

parent=$(dirname "$data_root")
mkdir -p "$parent"
staging=$(mktemp -d "$parent/.replicator-prepared.XXXXXX")
ditto "$source_root" "$staging"
mv "$staging" "$data_root"
echo "$data_root"
