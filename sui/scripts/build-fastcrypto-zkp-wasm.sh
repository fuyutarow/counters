#!/usr/bin/env bash
set -euo pipefail

echo "🔨 Building WASM module for @fuyutarow/fastcrypto-zkp..."

cd wasm/fastcrypto-zkp

# wasm-packインストール確認
if ! command -v wasm-pack &> /dev/null; then
    echo "📦 Installing wasm-pack..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# WASMビルド
echo "🏗️ Building WASM..."
wasm-pack build \
    --target web \
    --out-dir ../../public/wasm/fastcrypto-zkp \
    --out-name fastcrypto_zkp_wasm

echo "✅ WASM module built successfully"
echo "📍 Output: public/wasm/fastcrypto-zkp/"
ls -lh ../../public/wasm/fastcrypto-zkp/
