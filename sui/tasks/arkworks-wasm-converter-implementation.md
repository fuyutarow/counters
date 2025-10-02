# Arkworks WASM変換器実装タスク

**作成日**: 2025-10-02
**更新日**: 2025-10-02 - 実装前調査結果を反映
**目的**: snarkjs proof → Arkworks圧縮バイナリ変換をブラウザで実現
**根拠**: docs/arkworks変換の必要性.md参照

## エグゼクティブサマリー

### 中核問題
- **現状**: ブラウザでsnarkjs proofをSuiに送信不可（形式非互換）
- **原因**: snarkjs JSON（10進数、非圧縮、500B+）≠ Arkworks（バイナリ、圧縮、LE、128B固定）
- **解法**: Arkworks直接呼び出しWASM（`serialize_compressed`）

### 実装戦略
- **方針**: 薄いWASMラッパー（ロジックはRust、JSは呼び出しのみ）
- **保証**: Arkworksライブラリ直接使用により完全互換性
- **リスク**: WASMサイズ（2-4MB予想）、初期化時間（100-500ms予想）

### 実装前調査結果（2025-10-02）
| 項目 | 状態 | 詳細 |
|-----|------|------|
| Rust環境 | ✅ | rustc 1.90.0, cargo 1.90.0 |
| Arkworks | ✅ | v0.4.0で統一済み |
| wasm-pack | ❌ | 未インストール（要追加） |
| 既存WASM | ❌ | 初実装 |
| Next.js | ⚠️ | WASM設定なし（要追加） |

## 現状分析

### 既存実装の状態
| コンポーネント | パス | 状態 | 問題点 |
|------------|------|------|--------|
| Rust CLI | `circuits/convert-vk/src/bin/convert-proof.rs` | ✅動作 | ブラウザ非対応 |
| TypeScript | `src/utils/arkworks.ts` | ❌失敗 | ビッグエンディアン、圧縮不完全 |
| Node.jsテスト | `__tests__/node/private-counter.test.ts` | ✅動作 | CLI依存 |
| ブラウザUI | `src/hooks/useZkProver.ts` | ❌失敗 | オンチェーン検証失敗 |

### 技術的問題点
1. **エンディアン不一致**: TypeScriptはBE、ArkworksはLE必須
2. **圧縮未実装**: y座標符号ビットの末尾フラグ化が未実装
3. **G2順序**: c0,c1順の保証なし
4. **検証不能**: 128バイト出力がArkworks `serialize_compressed`と不一致

## 重要な論点と超越策

### 論点1: なぜnpmパッケージを使わないのか
**問題**: BN254圧縮に業界標準が存在しない
- Arkworks: リトルエンディアン、末尾フラグ、Fq2(c0,c1)
- EVM: ビッグエンディアン、圧縮なし、Fq2(c1,c0)
- @noble/curves: 意図的に`toBytes()`未実装（標準なしと明言）

**超越**: Arkworks直接呼び出しで標準化問題を回避

### 論点2: WASMサイズとパフォーマンス
**懸念**: Arkworks依存で数MB、初期化時間
**超越策**:
- `opt-level = "z"` + LTO + `wasm-opt -Oz`
- シングルトン初期化（1回のみ）
- 動的import（必要時のみロード）

### 論点3: エラーハンドリングと可観測性
**問題**: WASM境界でのエラー詳細度低下
**超越策**:
- Rust側で詳細エラーメッセージ生成
- JsValue経由で構造化エラー伝搬
- TypeScript側で型安全なエラー処理

### 論点4: Public Inputsの落とし穴
**発見**: ProofとPublic Inputsは別エンコーディング
- Proof: Arkworks `serialize_compressed`（楕円曲線点圧縮）
- Public: BCS u256（単純なLE 32バイト体要素）

**超越策**: 別関数で明示的に処理
```rust
#[wasm_bindgen]
pub fn convert_public_inputs_to_bytes(inputs_json: &str) -> Result<Vec<u8>, JsValue>
```

### 論点5: 既存コードとの互換性
**要件**: 既存API破壊禁止
**超越策**:
- 既存関数名維持
- WASMフォールバック実装
- 段階的移行可能

## Phase 1: Rust WASM基盤構築

### 1.1 lib.rs作成（改訂版）
**パス**: `circuits/convert-vk/src/lib.rs`

```rust
use ark_bn254::{Bn254, Fq, Fq2, G1Affine, G2Affine};
use ark_groth16::Proof;
use ark_serialize::CanonicalSerialize;
use ark_ff::PrimeField;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
struct SnarkjsProof {
    pi_a: Vec<String>,
    pi_b: Vec<Vec<String>>,
    pi_c: Vec<String>,
}

#[wasm_bindgen]
pub fn convert_proof_to_arkworks(proof_json: &str) -> Result<Vec<u8>, JsValue> {
    // JSONパース
    let snarkjs_proof: SnarkjsProof = serde_json::from_str(proof_json)
        .map_err(|e| JsValue::from_str(&format!("JSON parse error: {}", e)))?;

    // G1点パース (pi_a, pi_c)
    let a = parse_g1_affine(&snarkjs_proof.pi_a)
        .map_err(|e| JsValue::from_str(&format!("pi_a parse error: {}", e)))?;
    let c = parse_g1_affine(&snarkjs_proof.pi_c)
        .map_err(|e| JsValue::from_str(&format!("pi_c parse error: {}", e)))?;

    // G2点パース (pi_b)
    let b = parse_g2_affine(&snarkjs_proof.pi_b)
        .map_err(|e| JsValue::from_str(&format!("pi_b parse error: {}", e)))?;

    // Arkworks Proof構造体
    let proof = Proof::<Bn254> { a, b, c };

    // 圧縮直列化: A(32B) + B(64B) + C(32B) = 128B
    let mut proof_bytes = Vec::with_capacity(128);
    proof.a.serialize_compressed(&mut proof_bytes)
        .map_err(|e| JsValue::from_str(&format!("Serialize A error: {}", e)))?;
    proof.b.serialize_compressed(&mut proof_bytes)
        .map_err(|e| JsValue::from_str(&format!("Serialize B error: {}", e)))?;
    proof.c.serialize_compressed(&mut proof_bytes)
        .map_err(|e| JsValue::from_str(&format!("Serialize C error: {}", e)))?;

    // 長さ検証
    if proof_bytes.len() != 128 {
        return Err(JsValue::from_str(&format!(
            "Invalid proof size: expected 128, got {}",
            proof_bytes.len()
        )));
    }

    Ok(proof_bytes)
}

// 既存のパース関数を移植
fn parse_g1_affine(coords: &[String]) -> Result<G1Affine, String> {
    if coords.len() < 2 {
        return Err("G1 point requires at least 2 coordinates".to_string());
    }

    let x = Fq::from_str(&coords[0])
        .map_err(|e| format!("Failed to parse x: {}", e))?;
    let y = Fq::from_str(&coords[1])
        .map_err(|e| format!("Failed to parse y: {}", e))?;

    Ok(G1Affine::new(x, y))
}

fn parse_g2_affine(coords: &[Vec<String>]) -> Result<G2Affine, String> {
    if coords.len() < 2 || coords[0].len() < 2 || coords[1].len() < 2 {
        return Err("G2 point requires 2x2 coordinates".to_string());
    }

    let x0 = Fq::from_str(&coords[0][0])
        .map_err(|e| format!("Failed to parse x0: {}", e))?;
    let x1 = Fq::from_str(&coords[0][1])
        .map_err(|e| format!("Failed to parse x1: {}", e))?;
    let y0 = Fq::from_str(&coords[1][0])
        .map_err(|e| format!("Failed to parse y0: {}", e))?;
    let y1 = Fq::from_str(&coords[1][1])
        .map_err(|e| format!("Failed to parse y1: {}", e))?;

    let x = Fq2::new(x0, x1); // c0, c1順
    let y = Fq2::new(y0, y1); // c0, c1順

    Ok(G2Affine::new(x, y))
}

// public inputs変換も追加（オプション）
#[wasm_bindgen]
pub fn convert_public_inputs_to_bytes(inputs_json: &str) -> Result<Vec<u8>, JsValue> {
    let inputs: Vec<String> = serde_json::from_str(inputs_json)
        .map_err(|e| JsValue::from_str(&format!("JSON parse error: {}", e)))?;

    let mut result = Vec::with_capacity(inputs.len() * 32);

    for input in inputs {
        let value = Fq::from_str(&input)
            .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;

        // リトルエンディアン32バイト
        let mut bytes = vec![0u8; 32];
        value.serialize_compressed(&mut bytes)
            .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))?;

        result.extend_from_slice(&bytes);
    }

    Ok(result)
}
```

### 1.2 Cargo.toml更新
**パス**: `circuits/convert-vk/Cargo.toml`

```toml
[package]
name = "arkworks-converter"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[[bin]]
name = "convert-proof"
path = "src/bin/convert-proof.rs"

[[bin]]
name = "convert-vk"
path = "src/bin/convert-vk.rs"

[dependencies]
ark-bn254 = "0.4"
ark-groth16 = "0.4"
ark-serialize = "0.4"
ark-ff = "0.4"
ark-ec = "0.4"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
hex = "0.4"
wasm-bindgen = "0.2"

[profile.release]
opt-level = "z"     # サイズ最適化
lto = true          # Link Time Optimization
codegen-units = 1   # 単一コード生成ユニット

[package.metadata.wasm-pack]
wasm-opt = ["-Oz"]  # 追加のサイズ最適化
```

### 1.3 ビルドスクリプト
**パス**: `scripts/build-wasm.sh`

```bash
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
```

## Phase 2: TypeScript統合

### 2.1 WASMローダーラッパー
**パス**: `src/utils/wasm/arkworks-converter.ts`

```typescript
/**
 * Arkworks WASM Converter
 *
 * Singleton wrapper for the Arkworks proof converter WASM module.
 * Ensures one-time initialization and provides TypeScript-friendly API.
 */

import type { SnarkjsProof } from "@/utils/arkworks";

let wasmModule: any = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize WASM module (singleton)
 */
async function initWasm(): Promise<void> {
  if (wasmModule) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Dynamic import for Next.js compatibility
      const module = await import(
        /* webpackChunkName: "arkworks-wasm" */
        "/wasm/arkworks-converter/arkworks-converter.js"
      );

      // Initialize WASM
      await module.default();
      wasmModule = module;

      console.log("✅ Arkworks WASM converter initialized");
    } catch (error) {
      console.error("❌ Failed to initialize WASM:", error);
      throw new Error("WASM initialization failed");
    }
  })();

  return initPromise;
}

/**
 * Convert snarkjs proof to Arkworks compressed format
 *
 * @param proof snarkjs proof object
 * @returns Uint8Array (128 bytes) - Arkworks compressed proof
 */
export async function convertProofToArkworksWASM(
  proof: SnarkjsProof
): Promise<Uint8Array> {
  await initWasm();

  if (!wasmModule?.convert_proof_to_arkworks) {
    throw new Error("WASM module not properly initialized");
  }

  try {
    const proofJson = JSON.stringify(proof);
    const bytes = wasmModule.convert_proof_to_arkworks(proofJson);

    // Validate output
    if (!(bytes instanceof Uint8Array)) {
      throw new Error("Invalid WASM output type");
    }

    if (bytes.length !== 128) {
      throw new Error(`Invalid proof size: expected 128, got ${bytes.length}`);
    }

    return bytes;
  } catch (error) {
    console.error("WASM conversion error:", error);
    throw error;
  }
}

/**
 * Convert public inputs to Arkworks format
 *
 * @param publicInputs Array of field element strings
 * @returns Uint8Array - Concatenated little-endian field elements
 */
export async function convertPublicInputsToArkworksWASM(
  publicInputs: string[]
): Promise<Uint8Array> {
  await initWasm();

  if (!wasmModule?.convert_public_inputs_to_bytes) {
    throw new Error("WASM module not properly initialized");
  }

  try {
    const inputsJson = JSON.stringify(publicInputs);
    const bytes = wasmModule.convert_public_inputs_to_bytes(inputsJson);

    // Validate output
    if (!(bytes instanceof Uint8Array)) {
      throw new Error("Invalid WASM output type");
    }

    const expectedSize = publicInputs.length * 32;
    if (bytes.length !== expectedSize) {
      throw new Error(`Invalid size: expected ${expectedSize}, got ${bytes.length}`);
    }

    return bytes;
  } catch (error) {
    console.error("WASM conversion error:", error);
    throw error;
  }
}

/**
 * Check if WASM is available and initialized
 */
export function isWasmAvailable(): boolean {
  return wasmModule !== null;
}

/**
 * Preload WASM module (optional, for performance)
 */
export function preloadWasm(): Promise<void> {
  return initWasm();
}
```

### 2.2 既存コードのリファクタリング
**更新**: `src/utils/arkworks.ts`

```typescript
import { convertProofToArkworksWASM, isWasmAvailable } from "@/utils/wasm/arkworks-converter";

/**
 * Convert snarkjs proof to Arkworks compressed format
 *
 * Automatically uses WASM if available, falls back to (broken) JS implementation
 *
 * @param proof snarkjs proof object
 * @returns Promise<Uint8Array> (128 bytes)
 */
export async function convertProofToArkworks(proof: SnarkjsProof): Promise<Uint8Array> {
  // Try WASM first (correct implementation)
  try {
    return await convertProofToArkworksWASM(proof);
  } catch (error) {
    console.warn("WASM conversion failed, falling back to JS (WARNING: broken):", error);
    // Fall back to existing broken implementation
    return convertProofToArkworksJS(proof);
  }
}

// Rename existing function
function convertProofToArkworksJS(proof: SnarkjsProof): Uint8Array {
  // ... existing broken implementation ...
}
```

### 2.3 フックの更新
**更新**: `src/hooks/useZkProver.ts`

```typescript
import { preloadWasm } from "@/utils/wasm/arkworks-converter";

// In the hook initialization
useEffect(() => {
  // Preload WASM module on component mount
  preloadWasm().catch(console.error);
}, []);

// In generateProof function
const proofBytes = await convertProofToArkworks(proof as SnarkjsProof);
```

## Phase 3: ビルド・デプロイ設定

### 3.1 package.json更新
```json
{
  "scripts": {
    "build:wasm": "bash scripts/build-wasm.sh",
    "build": "npm run build:wasm && next build",
    "dev": "npm run build:wasm && next dev"
  }
}
```

### 3.2 Next.js設定
**更新**: `next.config.js`

```javascript
module.exports = {
  webpack: (config, { isServer }) => {
    // WASM support
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Ensure WASM files are properly handled
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    return config;
  },

  // Static file serving for WASM
  async headers() {
    return [
      {
        source: '/wasm/:path*',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/wasm',
          },
        ],
      },
    ];
  },
};
```

### 3.3 mise.toml更新
```toml
[tasks."build:wasm"]
description = "Arkworks WASM変換器のビルド"
alias = "wasm"
run = '''
#!/usr/bin/env bash
set -euo pipefail
bash scripts/build-wasm.sh
'''

# 既存のbuildタスクに統合
[tasks.build]
depends = ["build:wasm", "codegen", "build:ui"]
```

## Phase 4: テスト・検証

### 4.1 E2Eテスト
**パス**: `__tests__/wasm/arkworks-converter.test.ts`

```typescript
import { describe, it, before } from "node:test";
import assert from "node:assert";
import { convertProofToArkworksWASM } from "@/utils/wasm/arkworks-converter";
import { execSync } from "node:child_process";
import fs from "node:fs";

describe("Arkworks WASM Converter", () => {
  const testProof = {
    pi_a: ["1234...", "5678...", "1"],
    pi_b: [["1111...", "2222..."], ["3333...", "4444..."], ["1", "0"]],
    pi_c: ["9999...", "8888...", "1"],
    protocol: "groth16",
    curve: "bn128"
  };

  it("should produce identical output to Rust CLI", async () => {
    // WASM conversion
    const wasmBytes = await convertProofToArkworksWASM(testProof);

    // CLI conversion (reference)
    fs.writeFileSync("/tmp/test-proof.json", JSON.stringify(testProof));
    execSync("circuits/convert-vk/target/release/convert-proof /tmp/test-proof.json /tmp/test-proof.bin");
    const cliBytes = fs.readFileSync("/tmp/test-proof.bin");

    // Compare
    assert.deepStrictEqual(wasmBytes, new Uint8Array(cliBytes));
  });

  it("should produce exactly 128 bytes", async () => {
    const bytes = await convertProofToArkworksWASM(testProof);
    assert.strictEqual(bytes.length, 128);
  });

  it("should handle invalid input gracefully", async () => {
    const invalidProof = { pi_a: ["invalid"] };
    await assert.rejects(
      convertProofToArkworksWASM(invalidProof as any),
      /parse error/
    );
  });
});
```

### 4.2 ブラウザ動作確認チェックリスト
- [ ] WASMモジュールのロード成功
- [ ] 初回変換の動作確認
- [ ] 複数回連続変換の安定性
- [ ] エラーハンドリング動作
- [ ] パフォーマンス測定（vs CLI: 目標 <100ms）

## アーキテクチャ判断の根拠

### なぜWASM一択なのか（代替案の却下理由）

| 代替案 | 却下理由 | リスク |
|--------|----------|--------|
| 純TypeScript実装 | BN254楕円曲線演算の再実装必要 | バグ、メンテナンス地獄 |
| サーバーサイドAPI | レイテンシ、信頼性、コスト | 中央集権化、障害点 |
| 既存npmパッケージ | Arkworks準拠の保証なし | 1バイトのズレで全失敗 |
| Suiの改修要請 | 非現実的（数百万行依存） | 永遠に実現しない |

### パフォーマンス予測と対策

| 指標 | 予測値 | 対策 | 目標 |
|------|--------|------|------|
| WASMサイズ | 2-4MB | wasm-opt -Oz | <2MB |
| 初期化時間 | 100-500ms | preload + シングルトン | <200ms |
| 変換時間 | 10-50ms | 最適化ビルド | <20ms |
| メモリ使用 | 5-10MB | 明示的解放 | <10MB |

## 検証ポイント

### 必須確認事項（優先度順）
1. **バイト配置**: A(0-31) + B(32-95) + C(96-127) = 128バイト
2. **エンディアン**: すべてリトルエンディアン
3. **G2順序**: Fq2(c0, c1)
4. **圧縮フラグ**: 末尾ビットにy符号
5. **サブグループチェック**: `from_xy()`で検証済み

### オンチェーン検証
```typescript
// 最終確認: Suiテストネットで実際に検証
const tx = new Transaction();
const proofBytes = await convertProofToArkworksWASM(proof);
const publicBytes = convertPublicInputsToBytes(publicSignals);

// groth16::verify_groth16_proof_bcs呼び出し
// 成功 = 実装完了
```

## トラブルシューティング

### よくある問題と対策

| 問題 | 原因 | 対策 |
|-----|------|------|
| WASMロード失敗 | パス設定ミス | public/wasm/配下を確認 |
| 128バイト以外 | serialize設定ミス | compress指定確認 |
| 検証失敗 | エンディアン不一致 | LE確認、public inputsも含む |
| パフォーマンス低下 | 初期化繰り返し | シングルトン化確認 |

## 完了条件（受け入れ基準）

### 技術要件
- [ ] WASMビルド成功（サイズ<2MB）
- [ ] TypeScript統合完了（型安全）
- [ ] E2Eテスト全パス（CLI出力と一致）
- [ ] ブラウザ動作確認（初期化<200ms、変換<20ms）
- [ ] **オンチェーン検証100%成功**（最重要）
- [ ] Node.jsテストとの出力バイト完全一致

### ビジネス要件
- [ ] 既存APIの破壊的変更なし
- [ ] フォールバック機能動作
- [ ] エラーメッセージの可読性
- [ ] ドキュメント更新（使用方法、トラブルシューティング）

## 実装リスクと軽減策

| リスク | 影響 | 確率 | 軽減策 | 残存リスク |
|--------|------|------|--------|-----------|
| WASMサイズ超過 | UX低下 | 中 | 最適化設定、動的ロード | 低 |
| エンディアン誤り | 全失敗 | 低 | CLI比較テスト | 極低 |
| 初期化時間過多 | UX低下 | 中 | preload、シングルトン | 低 |
| ブラウザ非互換 | 利用不可 | 低 | WASM標準準拠 | 極低 |
| メモリリーク | 長期使用で低下 | 中 | 明示的解放 | 低 |

## 実装工数見積もり

| Phase | タスク | 工数 | 依存 |
|-------|--------|------|------|
| 1.1 | lib.rs作成 | 2h | wasm-pack |
| 1.2 | Cargo.toml更新 | 0.5h | - |
| 1.3 | ビルドスクリプト | 1h | - |
| 2.1 | TypeScriptラッパー | 2h | Phase 1完了 |
| 2.2 | arkworks.ts更新 | 1h | 2.1完了 |
| 2.3 | useZkProver更新 | 1h | 2.1完了 |
| 3.1-3 | ビルド設定 | 2h | Phase 2完了 |
| 4.1-2 | テスト・検証 | 3h | Phase 3完了 |
| **合計** | **12.5h** | **約2日** | - |

## 参考資料

### 技術仕様
- [Arkworks CanonicalSerialize](https://docs.rs/ark-serialize/latest/ark_serialize/trait.CanonicalSerialize.html)
- [wasm-pack documentation](https://rustwasm.github.io/wasm-pack/)
- [wasm-bindgen guide](https://rustwasm.github.io/wasm-bindgen/)
- [Sui groth16 module](https://docs.sui.io/references/framework/sui-framework/groth16)
- `docs/arkworks変換の必要性.md`

### 調査結果（2025-10-02）
- Rust環境: rustc 1.90.0, cargo 1.90.0（検証済み）
- Arkworks依存: v0.4.0統一（tree確認済み）
- wasm-pack: 未インストール（要追加）
- 既存構造: 2バイナリ（convert-proof, convert-vk）

---

## 実装決定事項（ADR形式）

### ADR-001: WASM採用の決定
- **日付**: 2025-10-02
- **状態**: 承認
- **コンテキスト**: ブラウザでArkworks変換が必要
- **決定**: Rust + wasm-bindgen + wasm-pack
- **理由**:
  - Arkworks直接使用で完全互換保証
  - npmパッケージは標準なし（@noble/curves非実装）
  - TypeScript再実装は高リスク
- **結果**: 初期ロード増加（<2MB）、100%互換性

### ADR-002: Public Inputs別関数化
- **日付**: 2025-10-02
- **状態**: 承認
- **コンテキスト**: ProofとPublic Inputsは別エンコーディング
- **決定**: 別WASM関数として実装
- **理由**:
  - Proof: Arkworks圧縮（楕円曲線点）
  - Public: BCS u256（単純LE体要素）
  - 混同防止
- **結果**: API明確化、エラー削減

### ADR-003: フォールバック維持
- **日付**: 2025-10-02
- **状態**: 承認
- **コンテキスト**: 既存壊れたTS実装が存在
- **決定**: WASMフォールバックとして維持
- **理由**:
  - 段階的移行可能
  - デバッグ容易
  - WASM失敗時の可観測性
- **結果**: コード若干増加、安全性向上

---

**ドキュメント終了**
**次のアクション**: 実装計画承認後、Phase 1開始