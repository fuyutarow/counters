import { createNetworkConfig } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";

const { networkConfig, useNetworkVariable, useNetworkVariables } = createNetworkConfig({
  testnet: {
    url: getFullnodeUrl("testnet"),
    variables: {
      counterPackageId: "0xce89666455299b6048aca6bb04a572ac3bb45addd97d45aff1c1d3576ea5cda8",
      sealPackageId: "0x73bba649fe918ef501e2fb6ab82e83450a4c286f52cf3399e678e6da257f0c50",
      walrusPackageId: "0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66",
      suiPackageId: "0x2",
    },
  },
  devnet: {
    url: getFullnodeUrl("devnet"),
    variables: {
      counterPackageId: "0x18903370f68278e20c29cede4a89785accc7b5299e3350b6790f1db76e4b4667",
      walrusPackageId: "", // Devnet未対応
      suiPackageId: "0x2",
    },
  },
  mainnet: {
    url: getFullnodeUrl("mainnet"),
    variables: {
      counterPackageId: "", // 未デプロイ
      walrusPackageId: "0x2c68824c0c9bd9527e072cfc250beb8d6b668f1bc8e0cf6e18e6428ee7b6c3ff", // Mainnet
      suiPackageId: "0x2",
    },
  },
});

export { networkConfig, useNetworkVariable, useNetworkVariables };
export type NetworkVariables = {
  counterPackageId: string;
  sealPackageId?: string;
  walrusPackageId: string;
  suiPackageId: string;
};
