import { type SuiCodegenConfig } from "@mysten/codegen";

/**
 * @mysten/codegen 設定
 *
 * 使い方:
 * 1. mise run gen [package_name]  - 完全フロー（summary + codegen）
 * 2. mise run codegen:summary    - Move サマリーのみ生成
 * 3. mise run codegen:ts         - TypeScript 型定義のみ生成
 *
 * 前提条件:
 * - Sui CLI v1.51.1+ (sui move summary サポート)
 * - package_summaries/ が生成済み（mise run codegen:summary で作成）
 */
const config: SuiCodegenConfig = {
  /** TypeScript 生成物の出力先 */
  output: "./src/generated",

  /**
   * 未登録パッケージの定義
   * MVR (Move Registry) 未登録のローカルパッケージを @local-pkg スコープで宣言
   */
  packages: [
    {
      /** MVR パッケージ名（未登録のため @local-pkg スコープ） */
      package: "@local-pkg/counter",
      /** Move パッケージのローカルパス */
      path: "./move/counter",
    },
    {
      /** Walrus パッケージ（テストネット版・ローカルパス） */
      package: "Walrus",
      path: "/home/fuyu/MYSTENLABS/walrus/testnet-contracts/walrus",
    },
  ],
};

export default config;
