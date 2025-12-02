# Cloudflare Workers / Miniflare 環境での考慮事項

## 背景: Duration と CPU Time の違い

Cloudflare Workers の制限を正しく理解することが重要。

| 概念 | 説明 | 制限 |
|------|------|------|
| **Duration（壁時計時間）** | リクエスト開始から終了までの総時間 | **ハードリミットなし**（クライアント接続が続く限り継続可能） |
| **CPU Time** | 実際に CPU を使用した時間 | Free: 10ms / Paid: 設定により最大 5 分 |

重要なポイント:

- `fetch` や WebSocket の「I/O 待ち」は Duration にのみ影響し、**CPU Time には含まれない**
- つまり「2〜3 秒待つ」こと自体は CPU Time 制限に引っかからない

## 本番 Workers での WebSocket サポート

Cloudflare Workers は **outbound WebSocket をサポート**している:

- 同時接続数: 6 接続/invocation（主に outbound 接続が対象）
- Durable Objects では数千クライアントまで接続可能
- WebSocket メッセージ到着ごとに DO の CPU タイマーがリセット（デフォルト 30s）

## Miniflare と本番 Workers の違い

Miniflare は Workers のローカルシミュレータであり、本番と完全に同一ではない:

| 項目 | 本番 Workers | Miniflare |
|------|-------------|-----------|
| **ランタイム** | workerd（本番） | workerd（エミュレーション） |
| **WebSocket** | 完全サポート | 実装差やバグが報告されている |
| **制限の適用** | 厳密 | 部分的 |

GitHub Issues を見ると、Durable Objects + WebSocket 周りでバージョン差による挙動差分が報告されている。

## Solana SDK との相性問題

### 問題の本質

`@solana/web3.js` v1.x の `confirmTransaction` は:

1. HTTP URL (`https://`) を自動的に WebSocket (`wss://`) に変換
2. `signatureSubscribe` WebSocket サブスクリプションを使用
3. この自動変換ロジックが Workers/Miniflare 環境と相性が悪い

### 観測された現象

- `bun run dev` (Next.js 開発サーバー): ✅ 動作
- `bun run dev:wrangler` (Miniflare): ❌ 30秒後にタイムアウト

エラーメッセージ: `Signature has expired: block height exceeded`

### 結論

問題は **Cloudflare Workers の制限ではなく**:

1. **Miniflare の WebSocket 実装**の挙動差
2. **@solana/web3.js SDK** の Workers 非対応

## 設計原則: Server submits, Client waits

**サーバーはトランザクションを送信するだけ、クライアントが確認待ちする**という原則を採用。

```text
┌─ Server (Backend API) ─────────────────────────┐
│                                                │
│  1. Deserialize / Validate                     │
│  2. Sign (sponsor signature)                   │
│  3. Submit transaction → RPC                   │
│  4. Return digest/signature immediately ✅     │
│                                                │
│  ❌ Do NOT wait for confirmation here          │
│                                                │
└────────────────────────────────────────────────┘
                    ↓
            { signature/digest }
                    ↓
┌─ Client (Browser) ─────────────────────────────┐
│                                                │
│  5. Receive signature/digest                   │
│  6. Wait for confirmation ✅                   │
│     - Solana: connection.confirmTransaction()  │
│     - Sui: suiClient.waitForTransaction()      │
│                                                │
└────────────────────────────────────────────────┘
```

### なぜこの設計か

| 理由 | 説明 |
|------|------|
| **責務の分離** | サーバーは署名と送信、クライアントは UX（待機表示）を担当 |
| **二重待機の回避** | サーバーとクライアントの両方で待つのは無駄 |
| **SDK 互換性** | ブラウザ環境の方が SDK の確認機能との相性が良い |
| **Workers 制限回避** | WebSocket 依存の確認処理を Workers 外に出せる |

### 例外: サーバー自身のトランザクション

サーバーが自身のために実行するトランザクション（例: Gas コイン事前割当）は、サーバー側で待機してよい:

```typescript
// Sui: /allocate endpoint - サーバー自身のトランザクション
const result = await suiClient.executeTransactionBlock({
  transactionBlock: txBytes,
  signature: sponsorSignature,
  options: { showEffects: true },
  requestType: "WaitForLocalExecution", // ✅ OK - サーバー自身の tx
});
```

これはクライアントに返す前にトランザクションが確定している必要があるため。

## Miniflare との相性問題

「Backend で WebSocket ベースの確認を呼ばない」という設計は、**Cloudflare の制限がキツいから**ではなく:

- Miniflare との挙動差を避けたい
- Node 向け SDK の WebSocket 実装が Workers 環境と相性悪い
- 検証が終わっていない段階でのリスク回避

として合理的な判断。

## チェーン別の状況

| チェーン | 確認方式 | SDK の Workers 対応 | ユーザー tx の Backend 確認 |
|---------|---------|-------------------|---------------------------|
| **Solana** | WebSocket サブスクリプション | ⚠️ 相性問題あり | ❌ クライアント側で実施 |
| **Sui** | HTTP ポーリング | ✅ 問題なし | ❌ クライアント側で実施（設計原則） |

※ サーバー自身のトランザクション（Gas 事前割当等）は Backend 確認 OK

## 将来的な選択肢

Backend で確認が必要な場合の代替案:

| 方式 | 説明 | メリット | デメリット |
|------|------|---------|-----------|
| **HTTP ポーリング** | `getSignatureStatuses` を定期的に呼び出し | Miniflare でも安定、SDK 依存なし | RPC 負荷が高い |
| **DO + WebSocket** | Durable Object で 1 本の WebSocket を multiplex | 効率的、本番向き | 実装複雑 |

### HTTP ポーリング例（Solana）

```typescript
async function pollTransactionStatus(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number
) {
  while (true) {
    const status = await connection.getSignatureStatuses([signature]);
    if (status.value[0]?.confirmationStatus === 'confirmed') return;

    const blockHeight = await connection.getBlockHeight();
    if (blockHeight > lastValidBlockHeight) throw new Error('Expired');

    await new Promise(r => setTimeout(r, 1000));
  }
}
```

## 参考リンク

- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Durable Objects Limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
- [Durable Objects WebSockets Best Practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Miniflare WebSockets](https://developers.cloudflare.com/workers/testing/miniflare/core/web-sockets/)
- [workerd Issue #4864 - Hibernation for outbound WebSocket](https://github.com/cloudflare/workerd/issues/4864)
- [Cloudflare Community: WebSocket Duration Limits](https://community.cloudflare.com/t/websocket-duration-limits/813611)
- [Solana Stack Exchange: WebSocket Requirements](https://solana.stackexchange.com/questions/17527/do-i-need-websockets-for-sendandconfirmtransaction-in-web3-js-version-2)
