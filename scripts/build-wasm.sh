#!/usr/bin/env bash
# Compiles the local c2pa-rs checkout to WebAssembly for the web app.
#   scripts/build-wasm.sh            # release
#   scripts/build-wasm.sh --dev      # faster, unoptimized
set -euo pipefail
cd "$(dirname "$0")/.."

# c2pa-rs's C dependencies need upstream LLVM clang for wasm32 on macOS (Xcode clang lacks the target).
if [[ "$(uname)" == "Darwin" && -z "${CC:-}" ]]; then
  LLVM="$(brew --prefix llvm 2>/dev/null || echo /opt/homebrew/opt/llvm)"
  export CC="$LLVM/bin/clang" AR="$LLVM/bin/llvm-ar"
fi

PROFILE="--release"
[[ "${1:-}" == "--dev" ]] && PROFILE="--dev"

wasm-pack build crates/viewer-wasm $PROFILE --target web --out-dir ../../web/src/wasm/pkg --out-name viewer
rm -f web/src/wasm/pkg/.gitignore web/src/wasm/pkg/package.json web/src/wasm/pkg/README.md
