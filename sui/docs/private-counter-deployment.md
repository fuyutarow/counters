# Private Counter Deployment Guide

## Overview

Private Counterは、ZK証明を使用してカウンター値を秘匿したまま+1のインクリメントを検証可能にするSui Move契約です。

## Architecture

### Move Contract Components

1. **PrivateCounter** (owned object)
   - `salt_digest: u256` - Poseidon(salt)、固定値
   - `value_digest: u256` - Poseidon(value, salt)、インクリメント毎に更新

2. **VK_BYTES** (constant)
   - `const VK_BYTES: vector<u8>` - Groth16 Verifying Key (Arkworks compressed format, 360 bytes)
   - Module内で定数として定義
   - `vk_bytes()`関数で外部パッケージからアクセス可能

### ZK Proof System

- **Circuit**: `private_counter.circom`
- **Curve**: BN254
- **Proof System**: Groth16
- **Hash Function**: Poseidon (ZK-friendly)

#### Public Inputs
1. `salt_digest` - Poseidon(salt)
2. `old_hash` - Poseidon(old_value, salt)
3. `new_hash` - Poseidon(old_value + 1, salt)

#### Private Inputs
- `salt` - 固定の秘密値
- `old_value` - 現在のカウンター値

## Deployment Process

### 1. Verifying Key Format

Verifying KeyはArkworks canonical compressed formatで360 bytesです：

```
- alpha_g1: 32 bytes (G1 compressed)
- beta_g2: 64 bytes (G2 compressed)
- gamma_g2: 64 bytes (G2 compressed)
- delta_g2: 64 bytes (G2 compressed)
- IC[0..3]: 32 * 4 = 128 bytes (4 G1 points compressed)
Total: 360 bytes
```

### 2. VK Bytes Generation

VK bytesはcircuit setupプロセスで生成されます：

```bash
# 1. Circom circuit compile
circom private_counter.circom --r1cs --wasm --sym -o build/

# 2. Trusted setup
snarkjs groth16 setup build/private_counter.r1cs keys/powersOfTau28_hez_final_14.ptau keys/private_counter_0000.zkey
snarkjs zkey contribute keys/private_counter_0000.zkey keys/private_counter_final.zkey
snarkjs zkey export verificationkey keys/private_counter_final.zkey keys/private_counter_vk.json

# 3. VK bytes取得 (元のMove testから)
git show <commit>:sui/move/counter/sources/private_counter.move | sed -n '/let vk_data = vector/,/];$/p'
```

### 3. VK Constant Definition

Move contractでVKを定数として定義：

```move
const VK_BYTES: vector<u8> = x"e2f26dbea299f5223b646cb1fb33eadb..."; // 360 bytes in hex

/// 外部パッケージ用のgetter関数
#[allow(implicit_const_copy)]
public fun vk_bytes(): vector<u8> {
    VK_BYTES
}
```

### 4. Deployment Steps

```bash
# 1. Build Move package
cd move/counter
sui move build

# 2. Test
sui move test

# 3. Publish
sui client publish --gas-budget 100000000

# 4. Note the PackageID from output
# Example: PackageID: 0xf28fe52b014d329bd4994ab35d703ad0f8a2adab617bcbc2679379150a9f2349
```

### 5. Update Network Config

```typescript
// src/networkConfig.ts
const { networkConfig, useNetworkVariable, useNetworkVariables } = createNetworkConfig({
  testnet: {
    url: getFullnodeUrl("testnet"),
    variables: {
      counterPackageId: "0xf28fe52b014d329bd4994ab35d703ad0f8a2adab617bcbc2679379150a9f2349",
      suiPackageId: "0x2",
    },
  },
});
```

### 6. Regenerate TypeScript Bindings

```bash
# Update suigen-config.json with new package ID
bun scripts/suigenv0.ts --config suigen-config.json --network testnet --output src/generated
```

## Why Use VK Constant Instead of Shared Object?

### ❌ 以前のアプローチ: VerifyingKeyRegistry (shared object)

**問題点:**
- Shared objectのため、各incrementでregistry引数が必要
- 不必要なobject参照とストレージコスト
- init()でVK bytesをハードコード or デプロイ後に手動設定

### ✅ 現在のアプローチ: VK Constant

```move
const VK_BYTES: vector<u8> = x"e2f26dbea299f5223b646cb1fb33eadb...";

public fun increment(
    self: &mut PrivateCounter,
    proof_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
) {
    let is_valid = verify_increment_proof(&vk_bytes(), &proof_bytes, &public_inputs_bytes);
    // ...
}
```

**利点:**
- シンプルなincrement関数シグネチャ（registry引数不要）
- Module定数として一度だけロード
- 外部パッケージから`vk_bytes()`でアクセス可能
- ガスコスト削減

## Client-Side (TypeScript)

### Local Storage

```typescript
interface StoredCounterData {
  salt: string;           // 固定の秘密値
  value: string;          // 現在のカウンター値
  valueHash: string;      // Poseidon(value, salt)
  saltHash: string;       // Poseidon(salt)
}
```

### Increment Flow

1. LocalStorageから秘密情報を取得
2. ZK証明を生成 (browser内でsnarkjs使用)
   - Input: `salt`, `old_value`
   - Output: `proof`, `publicSignals`
3. Sui transaction実行
   - `increment(registry, counter, proof_bytes, public_inputs_bytes)`
4. LocalStorageを更新 (new value, new hash)

## Testing

### Move Test

```bash
sui move test
```

Move testではVK bytesとproofをハードコードしています。

### E2E Test

```bash
bun test __tests__/manual/snarkjs-proof-generation.test.ts
```

## Troubleshooting

### Error: MoveAbort in groth16::prepare_verifying_key_internal

**原因**: VK Registryが空

**解決策**: `init()`関数でVK bytesをハードコードして再デプロイ

### VK Bytes Mismatch

Move testの360 bytesとTypeScriptの`serializeVerifyingKey()`が生成する704 bytesは異なります。

- Move test: Arkworks compressed format (360 bytes)
- TypeScript: Uncompressed format (704 bytes)

**解決策**: Move testのVK bytesを使用
