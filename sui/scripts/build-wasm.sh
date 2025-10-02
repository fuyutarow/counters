#!/usr/bin/env bash
set -euo pipefail

echo "🔨 Building WASM module for Arkworks converter..."

cd circuits/convert-vk

# wasm-packインストール確認
if ! command -v wasm-pack &> /dev/null; then
    echo "📦 Installing wasm-pack..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# WASMビルド
echo "🏗️ Building WASM..."
wasm-pack build \
    --target web \
    --out-dir ../../public/wasm/arkworks-converter \
    --out-name arkworks-converter

echo "✅ WASM module built successfully"
echo "📍 Output: public/wasm/arkworks-converter/"
ls -lh ../../public/wasm/arkworks-converter/
