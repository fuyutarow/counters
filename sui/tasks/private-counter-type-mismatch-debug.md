# Private Counter Type Mismatch Debug

## 現状認識（2025-10-02）

### エラー内容
```
Dry run failed, could not automatically determine a budget:
CommandArgumentError { arg_idx: 0, kind: TypeMismatch } in command 0
```

### ファクト（確認済み事項）

1. **Proof生成は成功している**
   - DEBUG log: Proof generated successfully
   - `proofBytesLength: 128` ✓ (正しい Arkworks compressed format)
   - `publicInputsBytesLength: 96` ✓ (3 public inputs × 32 bytes)
   - WASM module loaded successfully

2. **Transaction parameters are correct**
   - `counterPackageId: '0x8773ad4142fe6e85dbdb6c178d956ac50ce56f09938bd10e6721e59d0a1052b4'`
   - `counterId: '0xbd38f15c04769176d91dd25413c72177b2e1d270294eda87fd1ea03814d90de8'`
   - Arguments: `[tx.object(counterId), Array.from(proofBytes), Array.from(publicInputsBytes)]`

3. **Node.js test uses identical pattern and works**
   - Same `increment()` function call
   - Same argument structure: `[tx.object(counterId), Array.from(...), Array.from(...)]`
   - Same package ID from networkConfig
   - Tests pass successfully

4. **Generated TypeScript binding expects:**
   ```typescript
   argumentsTypes = [
     `${packageAddress}::private_counter::PrivateCounter`,
     "vector<u8>",
     "vector<u8>",
   ]
   ```

### 問題の核心

**arg_idx: 0** = 第1引数（counter object）で型不一致が発生

考えられる原因：
1. ❌ Package ID が間違っている → DEBUG log で確認済み、正しい
2. ❌ Counter object が存在しない → UI に value hash が表示されている = object exists
3. ❌ Proof が不正 → 生成成功、サイズも正しい
4. ❌ 引数の渡し方が間違っている → Node.js test と同一パターン
5. **❓ Browser と Node.js で Transaction serialization が異なる可能性**
6. **❓ Counter object の owner が wallet address と一致していない可能性**

### 次の調査ステップ

1. **Counter object の ownership 確認**
   ```typescript
   const obj = await suiClient.getObject({
     id: counterId,
     options: { showContent: true, showOwner: true }
   });
   console.log("Counter owner:", obj.data?.owner);
   console.log("Wallet address:", account.address);
   ```

2. **Transaction build 直後の inspect**
   ```typescript
   const tx = new Transaction();
   increment(...)(tx);
   console.log("Transaction commands:", tx.getData().commands);
   ```

3. **Sui client network 確認**
   ```typescript
   const network = await suiClient.getChainIdentifier();
   console.log("Connected network:", network);
   ```

### 既知の事実

- Move contract signature: `public fun increment(self: &mut PrivateCounter, proof_bytes: vector<u8>, public_inputs_bytes: vector<u8>)`
- TypeScript binding: Correctly generated from Move contract
- `normalizeMoveArguments()` handles type conversion
- `tx.object()` creates correct transaction argument for object references

### 仮説

**最有力仮説**: Counter object が別の wallet address に所有されている
- Counter creation 時に `tx.transferObjects([counter], account.address)` したか？
- Browser wallet の address と Node.js test の address が異なる
- Owned object は owner だけが mutable reference を取得できる

**検証方法**: Counter の owner field を確認
