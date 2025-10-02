# なぜArkworks変換が絶対に必要なのか

**日付**: 2025-10-02
**ステータス**: 基盤アーキテクチャドキュメント
**目的**: snarkjsでのproof生成だけでは不十分な理由を説明

---

## 要約

Suiブロックチェーン上でsnarkjsを使ってZKアプリケーションを構築する場合、Arkworks形式への変換ステップが**絶対に必須**です。本ドキュメントでは以下を説明します：

1. なぜ変換が必要なのか（オプションではない）
2. 正確にどのような形式の違いがあるのか
3. なぜnpmパッケージが存在しないのか
4. どのような実装オプションがあるのか

---

## 目次

1. [根本的な問題](#1-根本的な問題)
2. [Proof形式の比較](#2-proof形式の比較)
3. [Arkworks形式が発生した理由](#3-arkworks形式が発生した理由)
4. [NPMエコシステムのギャップ](#4-npmエコシステムのギャップ)
5. [実装オプション](#5-実装オプション)
6. [参考文献](#6-参考文献)

---

## 1. 根本的な問題

### 1.1 アーキテクチャスタック

```
ブラウザ/Node.js環境
    ↓
  snarkjs (JavaScript ZK proof生成器)
    ↓
  Proof出力: 10進数文字列座標を含むJSON
    ↓
  ??? 変換必須 ???
    ↓
  Suiブロックチェーン
    ↓
  sui::groth16モジュール (Moveコントラクト)
    ↓
  fastcryptoライブラリ (Rust, Arkworksベース)
    ↓
  期待される形式: Arkworks圧縮バイナリ形式
```

### 1.2 決定的な不一致

**snarkjsが生成するもの**:
- 形式: JSON
- エンコーディング: 10進数文字列
- 構造: 非圧縮楕円曲線点

**Sui groth16が期待するもの**:
- 形式: バイナリ
- エンコーディング: 圧縮体要素
- 構造: Arkworks正規圧縮シリアライゼーション

**結果**: 直接的な非互換性により変換が必要。

---

## 2. Proof形式の比較

### 2.1 Groth16 Proofの数学的構造

Groth16 proofは3つの楕円曲線点から構成されます：
- **A** ∈ G1 (BN254曲線)
- **B** ∈ G2 (BN254曲線)
- **C** ∈ G1 (BN254曲線)

snarkjsもArkworksも同じ数学的proofを表現していますが、シリアライゼーション形式が異なります。

### 2.2 snarkjs出力形式

**実際の実行結果** (`__tests__/show-snarkjs-format.mjs`より):

```json
{
  "pi_a": [
    "6756983824930269258301816064015147447694747087015872815873654487046658583765",
    "14725957578728626107309603707212362733843716294370069461910277051407076197453",
    "1"
  ],
  "pi_b": [
    [
      "20295815913096526344501243689522423953591197970040148270241498042520771448295",
      "7331573541547389430821347255074950275048135120270663975401445138313455044231"
    ],
    [
      "21463894303489799960864288562635530199698344665619340846742496947282481096504",
      "5481152726076914803380913784625335336440438731117069455604828754577507319127"
    ],
    ["1", "0"]
  ],
  "pi_c": [
    "10187561823668324948982793488525657701449154365448277688304119201463353104608",
    "18819152095870621885210374259630569502275750979850441310548839788186748421820",
    "1"
  ],
  "protocol": "groth16",
  "curve": "bn128"
}
```

**形式の特徴**:
- **型**: JSONオブジェクト
- **座標**: 10進数文字列（16進数でもバイナリでもない）
- **G1点** (pi_a, pi_c): `[x, y, 1]` - 3要素
- **G2点** (pi_b): `[[x_c0, x_c1], [y_c0, y_c1], [1, 0]]` - 複雑なFq2構造
- **サイズ**: JSONテキストとして約500バイト以上

### 2.3 Arkworks圧縮形式

**バイナリ構造** (合計128バイト):

```
オフセット | 長さ | 説明
-----------|------|-------------
0x00       | 32   | pi_a.x (G1 x座標、リトルエンディアン)
           |      | フラグビットは末尾側に付与（実装依存）
0x20       | 32   | pi_b.x.c0 (G2 x Fq2成分0、リトルエンディアン)
0x40       | 32   | pi_b.x.c1 (G2 x Fq2成分1、リトルエンディアン)
           |      | フラグビットは末尾側に付与（実装依存）
0x60       | 32   | pi_c.x (G1 x座標、リトルエンディアン)
           |      | フラグビットは末尾側に付与（実装依存）
-----------|------|-------------
合計       | 128  | 固定サイズバイナリブロブ
```

**形式の特徴**:
- **型**: 生バイト (Uint8Array)
- **座標**: バイナリ体要素
- **エンディアン**: **リトルエンディアン**（`CanonicalSerialize`の仕様）
- **圧縮**: y座標を1ビット（符号）にエンコード
- **フラグ位置**: 末尾側に付与（`Flags` trait実装依存）
- **G1圧縮**: 32バイト (256ビット)
- **G2圧縮**: 64バイト (512ビット)
- **サイズ**: 正確に128バイト

**重要**: Arkworksの`CanonicalSerialize`は**リトルエンディアン**を規定しており、フラグビット（無限遠点、y符号など）は直列化データの末尾に付与されます。参考: [ark_serialize::CanonicalSerialize](https://docs.rs/ark-serialize/latest/ark_serialize/trait.CanonicalSerialize.html)

### 2.4 点圧縮の説明

**楕円曲線方程式**: y² = x³ + ax + b

x座標が与えられた場合：
1. y² = x³ + ax + b を計算
2. 平方根を取る → 2つの可能なy値（正/負）
3. x座標 + どちらのyかを示す1ビットのみ保存

**Arkworks圧縮方式**:
- **リトルエンディアン**でx座標をシリアライズ
- フラグビット（y符号、無限遠点など）は**末尾側に付与**
- 具体的なビット配置は`Flags` trait実装で型ごとに定義
- これが「圧縮」形式が存在する理由

**snarkjsが圧縮しない理由**:
- JavaScriptには圧縮機能を持つ標準的なBN254曲線ライブラリがない
- snarkjsはproof生成に焦点を当て、ブロックチェーン固有のシリアライゼーションは扱わない
- 異なるブロックチェーンが異なる圧縮スキームを使用（エンディアン、フラグ位置、Fp2順序など）

### 2.5 並列比較表

| 側面 | snarkjs | Arkworks |
|------|---------|----------|
| **出力型** | JSONオブジェクト | バイナリバッファ |
| **エンコーディング** | 10進数文字列 | **リトルエンディアン**バイト |
| **G1点サイズ** | 3 × 約77文字 ≈ 231バイト | 32バイト |
| **G2点サイズ** | 2 × 2 × 約77文字 ≈ 308バイト | 64バイト |
| **合計サイズ** | 約500バイト以上 | 128バイト |
| **Y座標** | 完全に含まれる | 1ビット（符号、末尾フラグ） |
| **エンディアン** | N/A（10進数） | **リトルエンディアン** |
| **標準化** | snarkjs固有 | Arkworks正規形式 |
| **ブラウザネイティブ** | はい（JSON） | いいえ（変換が必要） |

---

## 3. Arkworks形式が発生した理由

### 3.1 Suiフレームワークアーキテクチャ

```
Moveコントラクト層
    ↓
  sui::groth16モジュール (sui/crates/sui-framework/sources/groth16.move)
    ↓
  Rustネイティブ関数 (sui/crates/sui-framework/src/natives/groth16.rs)
    ↓
  fastcryptoライブラリ (github.com/MystenLabs/fastcrypto)
    ↓
  Arkworks (github.com/arkworks-rs/groth16)
```

**重要な決定点**: Mysten LabsがSuiのgroth16モジュールを構築した際の選択：
- **言語**: Rust（パフォーマンスのため）
- **ライブラリ**: Arkworks（Rust ZKライブラリの事実上の標準）
- **結果**: Arkworksシリアライゼーション形式が必須となった

### 3.2 Arkworks serialize_compressedメソッド

**ソース**: `ark-serialize` crate

```rust
pub trait CanonicalSerialize {
    fn serialize_compressed<W: Write>(&self, writer: W) -> Result<(), SerializationError>;
}
```

**実装の概要**:
```rust
// 概念的な説明（実際の実装は型ごとに異なる）
// CanonicalSerialize は以下を保証：
// 1. リトルエンディアンでの体要素直列化
// 2. フラグビット（y符号、無限遠点など）を末尾に付与
// 3. 圧縮時はx座標のみ保存（yは再計算可能）
```

**この正確な形式**（Arkworks `serialize_compressed`の出力）が`sui::groth16::proof_points_from_bytes`で期待されています。

**重要な仕様**:
- **エンディアン**: リトルエンディアン（`CanonicalSerialize`の規定）
- **フラグ**: 末尾側に付与（`Flags` trait）
- **参考**: [ark-serialize ドキュメント](https://docs.rs/ark-serialize/latest/ark_serialize/)

### 3.3 なぜsnarkjs形式を直接使わないのか？

**却下されたオプション**: Suiをsnarkjs JSONを受け入れるように修正

**理由**:
1. **Gasコスト**: オンチェーンでのJSONパースは高コスト
2. **バイトオーバーヘッド**: 500バイト vs 128バイト = 4倍のストレージコスト
3. **型安全性**: バイナリ形式は固定構造を持つ
4. **パフォーマンス**: Arkworksネイティブバイナリデシリアライゼーションが高速
5. **標準**: ArkworksはRustエコシステムの標準

**結論**: SuiのArkworks形式の選択はアーキテクチャ的に健全。ユーザーが適応する必要がある。

### 3.4 Suiドキュメントの証拠

**出典**: https://docs.sui.io/guides/developer/cryptography/groth16

```rust
let mut proof_serialized = Vec::new();
proof.serialize_compressed(&mut proof_serialized).unwrap();
```

**Moveコントラクトより** (`private_counter.move:175`)
```move
let proof_points = groth16::proof_points_from_bytes(*proof_bytes);
```

**証明**: Suiは明示的にArkworksの`serialize_compressed`の使用を文書化している。

---

## 4. NPMエコシステムのギャップ

### 4.1 Web検索調査 (2025-10-02)

**クエリ**: "snarkjs proof arkworks format conversion npm package browser"

**結果**:
- ❌ 専用npmパッケージは見つからず
- ❌ zkverifyjsは両方をサポートするが変換を公開していない
- ❌ @noble/curvesは意図的にBN254 `toBytes()`を省略（標準が存在しないため）

**@noble/curvesからの重要な発見**:
> "ライブラリはBN254に対して点メソッド`toHex`や`toRawBytes`を実装していません。なぜなら**BN254の異なる実装がそれぞれ異なる方法で実装しており - 標準が存在しない**からです。"

出典: https://github.com/paulmillr/noble-curves

### 4.2 標準が存在しない理由

**実装間でのBN254圧縮のバリエーション**:

| 実装 | エンディアン | Y符号エンコーディング | 虚数部の順序 (G2) |
|------|--------------|----------------------|-------------------|
| Arkworks | **リトルエンディアン** | 末尾フラグ | c0, c1 |
| EVM プリコンパイル (alt_bn128) | **ビッグエンディアン** | （圧縮なし） | c1, c0 |
| Zcash | ビッグエンディアン | フラグバイト | c0, c1 |

**補足**: EVM (EIP-197) は32バイト**ビッグエンディアン**で、G2のFp2要素を **(c1, c0)** 順で配置します。参考: [EIP-197](https://eips.ethereum.org/EIPS/eip-197)

**結果**: どのバリアントかを指定せずに「BN254圧縮」を提供できる普遍的なJavaScriptライブラリは存在しない。

### 4.3 既存ツールの分析

**snarkjs**:
- 目的: ZK proof生成
- 出力: JSON（普遍的、ブロックチェーン非依存）
- 圧縮: なし（意図的に形式中立を維持）

**@noble/curves**:
- 目的: 楕円曲線プリミティブ
- BN254サポート: あり（数学演算）
- 圧縮: なし（`toBytes()`未実装）
- 理由: 標準が存在しない

**zkverifyjs**:
- 目的: Proof検証サービスクライアント
- サポート: Arkworks、snarkjs、gnark
- 変換: 内部のみ（エクスポートされていない）

**websnark**:
- 目的: WASMベースのproof生成
- ステータス: 非推奨（tornado.cashプロジェクト）
- Arkworks: なし

**結論**: 変換ギャップが存在する理由：
1. snarkjsは（設計により）形式中立を維持
2. BN254圧縮の実装間で標準が存在しない（@noble/curvesも非実装を明言）
3. 各ブロックチェーンが異なる要件を持つ（エンディアン、フラグ位置、Fp2順序）
4. 確立した汎用npmパッケージは見当たらない

### 4.4 なぜWASMが正しい解決策なのか

**オプション1: 純粋なTypeScript実装**
- ❌ Arkworks圧縮を手動で実装する必要がある
- ❌ BN254楕円曲線演算をゼロから実装
- ❌ 検証できる参照実装がない
- ❌ 微妙なバグのリスクが高い（y符号エンコーディング）
- ❌ メンテナンス負担（Arkworksのアップデートを追跡する必要）

**オプション2: Rust + WASMを使用**
- ✅ Arkworksライブラリを直接使用（信頼できるソース）
- ✅ `serialize_compressed()`が正規実装
- ✅ Suiとの互換性が保証される
- ✅ すでに動作するRustツール（`convert-proof`）がある
- ✅ WASMはブラウザで実行（Web標準）

**決定**: WASMは単に簡単というだけでなく、**唯一信頼できる**アプローチ。

---

## 5. 実装オプション

### 5.1 現在の状態 (2025-10-02)

**Node.jsテスト** (`__tests__/node/private-counter.test.ts`):
```typescript
// Rust CLIツールを使用
const convertProofPath = path.join(__dirname, "circuits/convert-vk/target/release/convert-proof");
execSync(`${convertProofPath} ${proofJsonPath} ${proofBinPath}`);
const proofBytes = fs.readFileSync(proofBinPath);
```
✅ 動作する（オンチェーン検証パス）

**UI実装** (`src/hooks/useZkProver.ts`):
```typescript
// 不正なTypeScript実装を使用
const proofBytes = convertProofToArkworks(proof as SnarkjsProof);
```
❌ 動作しない（オンチェーン検証が失敗する）

**コード内の警告** (`src/utils/arkworks.ts:46-48`):
```typescript
/**
 * 注意: これはArkworksと一致しない簡略化された実装です。
 * プロダクションでは代わりにRust convert-proofツールを使用してください。
 * この実装はオンチェーン検証で有効なproofを生成しません。
 */
```

### 5.2 解決策: RustツールをWASM化

**アーキテクチャ**:
```
ブラウザ
  ↓
snarkjs.groth16.fullProve()
  ↓ (JSON proof)
WASMモジュール (Rust convert-proof)
  ↓ (128バイト Uint8Array)
Suiトランザクション
```

**実装ステップ**:

1. **Cargo.tomlにwasm-bindgenを追加**:
```toml
[dependencies]
wasm-bindgen = "0.2"
```

2. **WASMエクスポートを含むlib.rsを作成**:
```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn convert_proof_to_arkworks(proof_json: &str) -> Vec<u8> {
    // 既存のconvert-proofロジック
    // 128バイトVec<u8>を返す
}
```

3. **WASMをビルド**:
```bash
wasm-pack build --target web --out-dir ../../public/wasm/proof-converter
```

4. **TypeScriptで使用**:
```typescript
import init, { convert_proof_to_arkworks } from '@/public/wasm/proof-converter';

await init();  // WASMをロード
const proofBytes = convert_proof_to_arkworks(JSON.stringify(proof));
```

**メリット**:
- ✅ Node.jsテストとUIで同じコード
- ✅ Arkworks互換性が保証される
- ✅ npm依存関係不要
- ✅ WASMはWeb標準（すべてのモダンブラウザで動作）

### 5.3 代替アプローチを取らない理由

**Q: ethers.jsやviemを使えますか？**
A: いいえ。これらはEthereumのEVMプリコンパイル形式のみを扱い、Arkworksとは異なります。

**Q: @noble/curvesを使えますか？**
A: いいえ。意図的にBN254圧縮を実装していません（標準が存在しないため）。

**Q: snarkjsにArkworksエクスポートを追加するよう貢献できますか？**
A: 哲学的に間違っています。snarkjsはブロックチェーン非依存であるべきです。Arkworksサポートはブロックチェーン固有のツールに属します。

**Q: SuiにsnarkJS形式をサポートするよう依頼できますか？**
A: 非現実的です。SuiのArkworks形式は健全なアーキテクチャ選択（Gasコスト、パフォーマンス、標準）です。数百万行のコードがそれに依存しています。

---

## 6. 重要な補足: Public Inputsの落とし穴

### 6.1 エンディアン要件

**Sui groth16モジュールの要件**:
```move
let public_inputs = groth16::public_proof_inputs_from_bytes(*public_inputs_bytes);
```

**重要**: Public inputsは**32バイトリトルエンディアン連結**が必要です。

### 6.2 フォーマット詳細

**各Public Input**:
- サイズ: 32バイト
- エンディアン: **リトルエンディアン**（BCS u256エンコーディング）
- Proofとは別のエンコーディング

**例**: 3つのpublic inputsの場合:
```
[input0: 32B LE] [input1: 32B LE] [input2: 32B LE]
合計: 96バイト
```

### 6.3 正しい実装例

**TypeScript**:
```typescript
function convertPublicInputsToBytes(publicInputs: string[]): Uint8Array {
  const result = new Uint8Array(publicInputs.length * 32);

  for (let i = 0; i < publicInputs.length; i++) {
    const value = BigInt(publicInputs[i]);
    const bytes = new Uint8Array(32);

    // リトルエンディアン（BCS u256エンコーディング）
    for (let j = 0; j < 32; j++) {
      bytes[j] = Number((value >> BigInt(j * 8)) & 0xffn);
    }

    result.set(bytes, i * 32);
  }

  return result;
}
```

### 6.4 よくある間違い

❌ **ビッグエンディアンを使用**:
```typescript
// 間違い！
for (let j = 0; j < 32; j++) {
  bytes[31 - j] = Number((value >> BigInt(j * 8)) & 0xffn);
}
```

✅ **リトルエンディアンを使用**:
```typescript
// 正しい
for (let j = 0; j < 32; j++) {
  bytes[j] = Number((value >> BigInt(j * 8)) & 0xffn);
}
```

### 6.5 ProofとPublic Inputsの違い

| 要素 | Proof | Public Inputs |
|------|-------|---------------|
| エンディアン | リトルエンディアン | リトルエンディアン |
| 形式 | Arkworks圧縮 | BCS u256 |
| サイズ | 128バイト固定 | 32バイト × 入力数 |
| 圧縮 | あり（楕円曲線点） | なし（体要素） |

**重要**: ProofもPublic inputsも両方リトルエンディアンですが、エンコーディング形式が異なります。

---

## 7. 参考文献

### 7.1 ソースコード

- Sui groth16モジュール: `https://github.com/MystenLabs/sui/blob/main/crates/sui-framework/packages/sui-framework/sources/groth16.move`
- Sui groth16ネイティブ: `https://github.com/MystenLabs/sui/blob/main/crates/sui-framework/src/natives/groth16.rs`
- fastcrypto: `https://github.com/MystenLabs/fastcrypto`
- Arkworks groth16: `https://github.com/arkworks-rs/groth16`
- snarkjs: `https://github.com/iden3/snarkjs`
- @noble/curves: `https://github.com/paulmillr/noble-curves`

### 7.2 ドキュメント

- Sui Groth16ガイド: `https://docs.sui.io/guides/developer/cryptography/groth16`
- Suiフレームワーク groth16: `https://docs.sui.io/references/framework/sui-framework/groth16`
- Arkworksブック: `https://arkworks.rs/`
- snarkjs README: `https://github.com/iden3/snarkjs#readme`

### 7.3 このリポジトリ内の関連ファイル

- Moveコントラクト: `move/counter/sources/private_counter.move`
- Rust変換ツール: `circuits/convert-vk/src/bin/convert-proof.rs`
- Node.jsテスト: `__tests__/node/private-counter.test.ts`
- TypeScript（壊れている）: `src/utils/arkworks.ts`
- Proof形式デモ: `__tests__/show-snarkjs-format.mjs`

### 7.4 Git履歴

- 初期Rustツール: `commit aeb7181` (2025-10-02)
- Rustを使用したテスト修正: `commit 04f6b6b` (2025-10-02)
- TypeScript警告追加: `commit 04f6b6b` (2025-10-02)

---

## 結論

**Arkworks変換が必須である理由**:

1. **Suiブロックチェーンがそれを要求している**（fastcrypto → Arkworks）
2. **snarkjsがそれを提供できない**（設計により形式中立）
3. **npmパッケージが存在しない**（BN254圧縮が標準化されていない）
4. **WASMが唯一信頼できる解決策**（Arkworksを直接使用）

**次のステップ**: Rust convert-proofツールのWASMラッパーを実装する。

---

**ドキュメントバージョン**: 1.0
**最終更新**: 2025-10-02
**作成者**: 開発チーム
**レビューステータス**: LLM消費用準備完了
