# Type Mismatch Root Cause Found

## 発見事実

Browser の counter object type:
```
0x52cc7a2752d5668afb0eda873a26ec0d9a687366ac48066760fdc5fa25656f90::private_counter::PrivateCounter
```

Package ID (networkConfig.testnet):
```
0x8773ad4142fe6e85dbdb6c178d956ac50ce56f09938bd10e6721e59d0a1052b4
```

## 問題

Counter object は **古い package** (`0x52cc...`) で作成されているが、
Transaction は **新しい package** (`0x8773...`) を使って increment を呼び出そうとしている。

## なぜ TypeMismatch エラーが発生するか

Move の型システムでは、型は完全修飾名（package ID を含む）で識別される：
- Counter object の型: `0x52cc...::private_counter::PrivateCounter`
- Transaction が期待する型: `0x8773...::private_counter::PrivateCounter`

これらは **別の型** として扱われるため、`TypeMismatch` エラーが発生する。

## 解決策

1. **Option A**: 古い counter を削除し、新しい package で counter を作成し直す
2. **Option B**: networkConfig を古い package ID (`0x52cc...`) に戻す
3. **Option C**: Package upgrade を使って既存の counter を新しい package に移行（複雑）

## 推奨

**Option A**: 新しい counter を作成し直す
- localStorage をクリアして古い counter を削除
- 新しい package (`0x8773...`) で counter を作成
- これにより型が一致する
