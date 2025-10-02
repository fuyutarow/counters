# ZK Proof Tests

## Running Tests

### Main Test Suite (Bun)
```bash
bun test        # または m t
# SEAL IBE multisig tests のみ実行（高速）
```

### Manual Tests (Node.js)
Bun 非互換のテスト（snarkjs の `worker_threads` 使用）

```bash
mise run test:manual  # または m tm
# ZK proof generation test を Node.js で実行
```

**理由**: snarkjs は内部で `worker_threads` を使用しており、Bun では互換性問題があります（[Bun Issue #22376](https://github.com/oven-sh/bun/issues/22376)）。Node.js では正常動作します。

## Test Files

### 自動テスト (`__tests__/`)
- `seal-ibe-multisig-e2e.test.ts` - SEAL IBE multisig 統合テスト（Bun ✅）

### Manual テスト (`__tests__/manual/`)
- `snarkjs-proof-generation.test.ts` - ZK proof 生成テスト（Node.js のみ）

### デバッグスクリプト (`__tests__/manual/`)
- `debug-snarkjs.mjs` - スタンドアロン ZK proof テスト（詳細ログ出力）
  ```bash
  node __tests__/manual/debug-snarkjs.mjs
  ```
