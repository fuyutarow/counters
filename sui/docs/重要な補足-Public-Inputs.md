# 重要な補足: Public Inputsのエンディアン要件

**日付**: 2025-10-02
**関連**: `arkworks変換の必要性.md`

---

## Suiにおける Public Inputs の要件

### 1. エンディアン要件

**Sui groth16モジュールの要件**:
```move
let public_inputs = groth16::public_proof_inputs_from_bytes(*public_inputs_bytes);
```

**重要**: Public inputsは**32バイトリトルエンディアン連結**が必要です。

### 2. フォーマット詳細

**各Public Input**:
- サイズ: 32バイト
- エンディアン: **リトルエンディアン**
- BCS u256エンコーディング

**例**: 3つのpublic inputsの場合:
```
[input0: 32B LE] [input1: 32B LE] [input2: 32B LE]
合計: 96バイト
```

### 3. 実装例（正しい変換）

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

### 4. よくある間違い

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

### 5. Proofとの違い

| 要素 | Proof | Public Inputs |
|------|-------|---------------|
| エンディアン | **リトルエンディアン** | **リトルエンディアン** |
| 形式 | Arkworks圧縮 | BCS u256 |
| サイズ | 128バイト固定 | 32バイト × 入力数 |

**重要**: ProofもPublic inputsも両方リトルエンディアンですが、エンコーディング形式が異なります。

### 6. 参考

- Sui groth16 ドキュメント: https://docs.sui.io/references/framework/sui-framework/groth16
- 本リポジトリの実装: `src/utils/arkworks.ts` の `convertPublicInputsToBytes`
- Node.jsテスト: `__tests__/node/private-counter.test.ts`

---

**注意**: この文書は`arkworks変換の必要性.md`の補足資料です。
