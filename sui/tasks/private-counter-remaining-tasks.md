# Private Counter 残タスク整理

## 現状まとめ

### 判明した問題の根本原因
- Counter object は古い package (`0x52cc...`) で作成されていた
- NetworkConfig は新しい package (`0x8773...`) を指している
- Move の型システムでは package ID も型の一部 → TypeMismatch エラー

### 実施した修正
1. **Package ID tracking**: localStorage に `packageId` フィールドを追加
2. **List filtering**: 現在の package ID と一致する counter のみ表示
3. **Validation**: Increment 時に package mismatch を検出してエラー表示

## 残タスク

### 1. 動作確認（最優先）
- [ ] ブラウザをリロード
- [ ] 古い counter がリストから消えることを確認
- [ ] 新しい Private Counter を作成
- [ ] Increment が成功することを確認（ZK proof 生成 → Transaction 実行 → On-chain update）

### 2. Debug logging のクリーンアップ
- [ ] `usePrivateCounter.ts` から debug console.log を削除
  - Line 185-186: Counter owner / wallet address
  - Line 207-212: Proof generation params
  - Line 223-228: Proof generated result
  - Line 237-242: Transaction params
  - Line 254-256: Transaction commands/inputs
- [ ] `useZkProver.ts` から debug logging があれば削除

### 3. Node.js テストの修正
- [ ] `__tests__/node/private-counter.test.ts` が timeout している問題を解決
  - Counter owner と test keypair (Carol) の address が不一致
  - テスト用 counter を正しい owner で作成するか、別の keypair を使用
- [ ] テストが実際に on-chain verification まで到達することを確認

### 4. エラーハンドリングの改善（オプション）
- [ ] Package mismatch エラー時に UI で「新しい counter を作成してください」ボタンを表示
- [ ] 古い counter を localStorage から削除する機能を追加

### 5. ドキュメント更新
- [ ] Package 更新時の手順をドキュメント化
  - NetworkConfig の package ID を更新
  - 古い counter は自動的に非表示になる
  - ユーザーは新しい counter を作成する必要がある

## 次のステップ

**まず動作確認（タスク1）を実施してください。**

ブラウザで以下を確認：
1. `/private-counter` にアクセス
2. Counter リストが空になっている（古い counter が除外された）
3. "Create Private Counter" で新しい counter を作成
4. Increment ボタンをクリック
5. ZK proof 生成 → Transaction 実行 → Value が 0 → 1 に更新される

成功したら、debug logging を削除してコードをクリーンアップします。
