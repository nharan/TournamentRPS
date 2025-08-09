#!/usr/bin/env bash
set -euo pipefail
if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "wasm-pack not found. Install from https://rustwasm.github.io/wasm-pack/" >&2
  exit 1
fi
wasm-pack build --target web --release
