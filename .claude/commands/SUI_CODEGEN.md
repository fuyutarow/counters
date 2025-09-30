# @mysten/codegen 徹底ブレイクダウン（自己完結レポート）

## 要約

`@mysten/codegen` は **Sui Move のパッケージ（モジュール・関数・構造体）から TypeScript の型安全な呼び出しラッパーと BCS パーサ**を生成する公式ツール（Mysten Labs の ts-sdks モノレポ内の 1 パッケージ）です。生成物は `@mysten/sui` SDK のトランザクション API と連携し、**Move 関数の引数・型・TypeArgs を TypeScript で安全に扱う**ことを目的とします。β扱いで仕様変更の可能性があります。([npm][1])

---

## 1. できること（スコープ）

* Move パッケージの **サマリー（ABI に相当）から TS コードを生成**
  → まず `sui move summary` で `package_summaries/` を作成し、それを解析して出力します（Sui CLI 1.51.1 以降が必要）。([npm][2])
* 生成されたコードで:

  * **関数呼び出しラッパー**（`tx.add(counter.increment({...}))` のような形）を利用可能。**位置引数/名前付き引数の両対応**。([npm][2])
  * **構造体の BCS デコード**ユーティリティを提供（`Counter.fromBase64(...)` など）。([npm][2])
* **Move Registry (MVR)** のパッケージ名解決に対応。未登録パッケージは `@local-pkg` スコープと **`SuiClient` の MVR override** で解決。`dapp-kit` とも連携可能。([npm][2])

> 注意: パッケージの**オンチェーン自動解析**ではなく、**ローカルで生成した `package_summaries/` を入力**にします（2025-09 時点の README 記載）。([npm][2])

---

## 2. 典型的な入出力フロー（最小手順）

1. パッケージにサマリーを生成

```bash
# Move パッケージのルートで
sui move summary
# => package_summaries/ が生成される（通常 .gitignore 推奨）
```

（CLI は **v1.51.1+** を要求）([npm][2])

2. プロジェクトに codegen を導入

```bash
pnpm add -D @mysten/codegen
```

3. `sui-codegen.config.ts` を作成（例）

```ts
import type { SuiCodegenConfig } from './src/config.js';

const config: SuiCodegenConfig = {
  output: './src/generated',
  generateSummaries: true, // *注: サンプルにあるが挙動は未ドキュメント（後述）
  prune: true,             // *注: 同上
  packages: [
    {
      package: '@your-scope/your-package', // MVR のパッケージ名 or @local-pkg/...
      path: './move/your-package',          // ローカルの Move パッケージパス
    },
  ],
};
export default config;
```

4. 生成を実行

```bash
pnpm sui-ts-codegen generate
# または package.json に "codegen": "sui-ts-codegen generate" を作り `pnpm codegen`
```

([npm][2])

**出力**: 例では `./src/generated/<pkg>/<module>.ts` に関数ラッパー・型・BCS ヘルパーが生成されます（README の import 例より推定）。([npm][2])

---

## 3. 生成物の使い方（呼び出しと BCS 解析）

### 3.1 Move 関数呼び出し（PTB と統合）

```ts
import { Transaction } from '@mysten/sui/transactions';
import * as counter from './generated/counter/counter';

async function createCounter() {
  const tx = new Transaction();
  tx.add(counter.create());
  const { digest } = await suiClient.signAndExecuteTransaction({ signer: keypair, transaction: tx });
  return digest;
}

async function incrementCount(id: string) {
  const tx = new Transaction();
  tx.add(counter.increment({
    arguments: {
      counter: id, // 文字列のままでも受け入れられるケースあり（下記オブジェクト解決を参照）
    },
  }));
  const { digest } = await suiClient.signAndExecuteTransaction({ signer: keypair, transaction: tx });
  return digest;
}
```

（公式 README の使用例。）([npm][2])

### 3.2 オブジェクト・純値・TypeArgs の取り扱い（重要）

* `@mysten/sui` の **PTB 基礎**:

  * **純値**は `tx.pure.*` または `tx.pure('vector<u8>', ...)` のように BCS 直列化して渡せます。([Mysten Labs TypeScript SDK Docs][3])
  * **オブジェクト ID** は、`transferObjects` など「オブジェクト専用引数」では **生の文字列をそのまま**渡せます。汎用 `moveCall` の場合は **`tx.object(id)` が必須**。([Mysten Labs TypeScript SDK Docs][3])
  * **受領（Receiving）引数**や **バージョン解決**は SDK 側が自動補完しますが、**RPC 追加呼び出し**が発生するため、最適化したい場合は `Inputs.ObjectRef(...)` など**完全解決参照**を渡すとよい。([Mysten Labs TypeScript SDK Docs][3])
* 生成ラッパーはこの PTB ルールに沿っており、**JS プリミティブ or `tx.pure` / `tx.object`** を受け取れるよう設計されています（README 記載）。TypeArgs は `typeArguments` プロパティで指定します。([npm][2])

### 3.3 BCS 型のパース

```ts
import * as counter from './generated/counter/counter';

async function readCounter(id: string) {
  const data = await suiClient.getObject({ id, options: { showBcs: true } });
  if (data.data?.bcs?.dataType !== 'moveObject') throw new Error('Expected a move object');
  return counter.Counter.fromBase64(data.data.bcs.bcsBytes);
}
```

（公式 README のサンプル。`@mysten/sui/bcs` の定義型一覧も参照可。）([npm][2])

---

## 4. ネットワークと MVR（Move Registry）解決

* パッケージが **MVR に登録済み**なら追加設定なしで名前解決。
* 未登録の場合は `@local-pkg/<name>` として宣言し、**`SuiClient` の `mvr.overrides.packages`** で **ネットワークごとの実パッケージ ID** を割り当てる。`dapp-kit` の `SuiClientProvider` とも組み合わせ可能。([npm][2])
* MVR の背景や運用ベストプラクティスは SuiNS Docs / 解説記事がまとまっています。([Sui Name Space Docs][4])

---

## 5. 設定ファイルの論点（`sui-codegen.config.ts`）

* `output`: 出力ディレクトリ。([npm][2])
* `packages[]`:

  * `package`: **MVR 名**（例 `@your-scope/your-package`、または `@local-pkg/...`）。
  * `path`: **ローカルの Move パッケージパス**。([npm][2])
* `generateSummaries`, `prune`: サンプルに登場するが公式 README では動作詳細が未説明。**名前からの推測では**「サマリーの自動生成」「出力整頓（不要ファイルの削除）」が連想されるが、**確証は公開情報にない**ため、導入時に実挙動を確認すること。([npm][2])

> 生成コマンドは `sui-ts-codegen generate`（スクリプトに登録可）。([npm][2])

---

## 6. 互換性・バージョン・ステータス

* **β版（Breaking の可能性あり）**の注意書きあり。([npm][2])
* **Sui CLI v1.51.1+ 必須**（`sui move summary` の実行要件）。([npm][2])
* パッケージは **MystenLabs/ts-sdks** リポジトリ配下で継続開発中（Issues に codegen 機能拡張の提案あり）。([GitHub][5])

---

## 7. 既知の落とし穴と先回りドリルダウン（疑義誘発点）

1. **「オブジェクト ID を素の文字列で渡せるのか？」**

   * `transferObjects` など「オブジェクト専用」引数では **文字列で可**。ただし `moveCall` では **`tx.object(...)` が必須**。受領引数は SDK が自動変換するが、**追加 RPC** が増える点に注意。([Mysten Labs TypeScript SDK Docs][3])

2. **「TypeArgs（ジェネリクス）は？」**

   * 生成ラッパーでは `typeArguments` を明示します（PTB の `moveCall` と同様の流儀）。型タグの補助 API 露出に関する Issue もあり、**型タグユーティリティ周りは進化中**。([Mysten Labs TypeScript SDK Docs][3])

3. **「MVR 未登録パッケージはどう扱う？」**

   * `@local-pkg` + `SuiClient.mvr.overrides` でネットワーク別のパッケージ ID をマッピング。`dapp-kit` 側でも `createNetworkConfig` により同様のオーバーライドが可能。([npm][2])

4. **「生成タイミングは？」**

   * Move の **ビルド/アップグレード後**や **関数シグネチャの変更**時には **再生成必須**。CI で `sui move summary && pnpm codegen` を流すと齟齬が減る（運用上の推奨）。

5. **「`generateSummaries` / `prune` の実態？」**

   * 公開 README では未説明。**有効化前に小規模パッケージで挙動検証**し、不要削除の影響がないか確認すること。([npm][2])

6. **「ABI ではなく何を読んでいる？」**

   * `package_summaries/`（`sui move summary` の成果物）を解析して生成。**オンチェーンのバイトコードのみからの自動生成は対象外**（README 記載範囲）。([npm][2])

7. **「大きな数値や Address の型は？」**

   * 直列化は **BCS** による。`@mysten/sui/bcs` に Sui 特有の型（`U64`/`Address` 等）の定義があり、`tx.pure` と組み合わせて確実にエンコードできる。([Mysten Labs TypeScript SDK Docs][6])

---

## 8. 代替アプローチとの比較（簡潔）

* **sui-client-gen**（コミュニティ製）: Move ソース/オンチェーンの両方から TS SDK を生成する試み。公式 `@mysten/codegen` は **公式 SDK との密結合/MVR サポート**が強み。要件や保守性で使い分け。([GitHub][7])

---

## 9. 運用 Tips（実務でのベストプラクティス）

* **CI 組み込み**:
  `sui move build && sui move summary && pnpm codegen && pnpm test`
* **MVR 運用**:
  テストネット/メインネットで **パッケージ ID を変数化**し、`SuiClient` の `mvr.overrides` または `dapp-kit` のネットワーク変数で切替。([npm][2])
* **RPC 最適化**:
  受領・共有・所有オブジェクトは **完全参照（`Inputs.*Ref`）** を渡すと解決コストを削減できる。([Mysten Labs TypeScript SDK Docs][3])
* **README の注意**:
  **β/破壊的変更**の但し書きあり。SDK/CLI のバージョンピン留めを推奨。([npm][2])

---

## 10. 付録：最小雛形（全部入りコマンド例）

```bash
# 1) Move パッケージ準備
sui move build
sui move summary  # => package_summaries/

# 2) アプリ側
pnpm add @mysten/sui
pnpm add -D @mysten/codegen

# 3) codegen 実行
pnpm sui-ts-codegen generate

# 4) 使う
# import * as mymod from './src/generated/<pkg>/<module>';
# const tx = new Transaction(); tx.add(mymod.some_move_fn({ arguments: {...}, typeArguments: [...] }));
# await client.signAndExecuteTransaction({ signer, transaction: tx });
```

（PTB API の詳細は SDK ドキュメント「Programmable Transaction Basics」を参照。）([Mysten Labs TypeScript SDK Docs][3])

---

## 参考（一次情報）

* `@mysten/codegen`（README/導入・使い方・MVR override 例・BCS パース例・CLI 1.51.1+ 要件・β注記）([npm][2])
* Sui TypeScript SDK ドキュメント（PTB 入力/オブジェクト/純値/受領/最適化の公式説明）([Mysten Labs TypeScript SDK Docs][3])
* Sui BCS 型一覧（`@mysten/sui/bcs`）([Mysten Labs TypeScript SDK Docs][6])
* ts-sdks リポジトリ（`codegen` の所在・開発状況）/ Issue（型タグゲッター拡張提案）([GitHub][5])
* Move Registry（MVR）ガイド/記事（名前解決の背景と運用）([Sui Name Space Docs][4])

---

### 最後に

このレポートは公開一次情報に基づき **自己完結** するよう整理しました。次のステップとしては、対象 Move パッケージの `package_summaries/` を作って小さな関数 1 つから生成・呼び出しまで通し、**MVR override** と **PTB の入力最適化**（`tx.object` / `Inputs.*Ref`）の手触りを掴むのが最短です。必要なら、あなたの実パッケージ構成に合わせた設定ファイル例や CI 設定もすぐ書き下ろします。

[1]: https://www.npmjs.com/package/%40mysten/codegen?activeTab=code&utm_source=chatgpt.com "mysten/codegen"
[2]: https://www.npmjs.com/package/%40mysten/codegen?activeTab=dependencies&utm_source=chatgpt.com "mysten/codegen"
[3]: https://sdk.mystenlabs.com/typescript/transaction-building/basics "Sui Programmable Transaction Basics | Mysten Labs TypeScript SDK Docs"
[4]: https://docs.suins.io/move-registry/maintainer-practices?utm_source=chatgpt.com "Package Maintainer Best Practices - SuiNS Docs"
[5]: https://github.com/MystenLabs/ts-sdks "GitHub - MystenLabs/ts-sdks"
[6]: https://sdk.mystenlabs.com/typescript/bcs "BCS | Mysten Labs TypeScript SDK Docs"
[7]: https://github.com/kunalabs-io/sui-client-gen?utm_source=chatgpt.com "kunalabs-io/sui-client-gen: A tool for generating TS SDKs ..."
