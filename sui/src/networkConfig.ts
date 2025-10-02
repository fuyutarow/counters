import { createNetworkConfig } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";

const { networkConfig, useNetworkVariable, useNetworkVariables } = createNetworkConfig({
  testnet: {
    url: getFullnodeUrl("testnet"),
    variables: {
      counterPackageId: "0x52cc7a2752d5668afb0eda873a26ec0d9a687366ac48066760fdc5fa25656f90",
      sealPackageId: "0x73bba649fe918ef501e2fb6ab82e83450a4c286f52cf3399e678e6da257f0c50",
      suiPackageId: "0x2",
      vkRegistryId: "0x7a6f532b9c0e0ee493b93592df2515fb32677143053c5ea60e007c3686dd2c3a",
    },
  },
  devnet: {
    url: getFullnodeUrl("devnet"),
    variables: {
      counterPackageId: "0x18903370f68278e20c29cede4a89785accc7b5299e3350b6790f1db76e4b4667",
      suiPackageId: "0x2",
      vkRegistryId: "", // 未デプロイ
    },
  },
  mainnet: {
    url: getFullnodeUrl("mainnet"),
    variables: {
      counterPackageId: "", // 未デプロイ
      suiPackageId: "0x2",
      vkRegistryId: "", // 未デプロイ
    },
  },
});

export { networkConfig, useNetworkVariable, useNetworkVariables };
export type NetworkVariables = {
  counterPackageId: string;
  sealPackageId?: string;
  suiPackageId: string;
  vkRegistryId: string;
};
