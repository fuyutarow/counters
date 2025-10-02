#!/usr/bin/env bash
set -euo pipefail

echo "🔨 Building WASM module for BN254 Groth16 Arkworks Serializer..."

cd wasm/bn254-groth16-arkworks-serializer

# wasm-packインストール確認
if ! command -v wasm-pack &> /dev/null; then
    echo "📦 Installing wasm-pack..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# WASMビルド
echo "🏗️ Building WASM..."
wasm-pack build \
    --target web \
    --out-dir ../../public/wasm/bn254-groth16-arkworks-serializer \
    --out-name bn254_groth16_arkworks_serializer

echo "✅ WASM module built successfully"
echo "📍 Output: public/wasm/bn254-groth16-arkworks-serializer/"
ls -lh ../../public/wasm/bn254-groth16-arkworks-serializer/
