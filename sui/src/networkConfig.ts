import { createNetworkConfig } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";

/**
 * デプロイ済みパッケージIDの定義
 * 新しくデプロイした場合は、ここを更新してください
 */
const PACKAGE_IDS = {
  testnet: {
    counter: "0x428e7ca6144417cd9e6bfe9b8a8c5f6fc612a4761b5720c6f25bdc79815c453a",
    seal: "0x73bba649fe918ef501e2fb6ab82e83450a4c286f52cf3399e678e6da257f0c50",
    sui: "0x2",
  },
  devnet: {
    counter: "0x18903370f68278e20c29cede4a89785accc7b5299e3350b6790f1db76e4b4667",
    sui: "0x2",
  },
  mainnet: {
    counter: "", // 未デプロイ
    sui: "0x2",
  },
} as const;

// ネットワーク設定
const { networkConfig, useNetworkVariable, useNetworkVariables } = createNetworkConfig({
  testnet: {
    url: getFullnodeUrl("testnet"),
    variables: {
      counterPackageId: PACKAGE_IDS.testnet.counter,
      sealPackageId: PACKAGE_IDS.testnet.seal,
      suiPackageId: PACKAGE_IDS.testnet.sui,
    },
  },
  devnet: {
    url: getFullnodeUrl("devnet"),
    variables: {
      counterPackageId: PACKAGE_IDS.devnet.counter,
      suiPackageId: PACKAGE_IDS.devnet.sui,
    },
  },
  mainnet: {
    url: getFullnodeUrl("mainnet"),
    variables: {
      counterPackageId: PACKAGE_IDS.mainnet.counter,
      suiPackageId: PACKAGE_IDS.mainnet.sui,
    },
  },
});

export { networkConfig, useNetworkVariable, useNetworkVariables };
export type NetworkVariables = {
  counterPackageId: string;
  sealPackageId?: string;
  suiPackageId: string;
};
