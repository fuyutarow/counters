import { createNetworkConfig } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";

const { networkConfig, useNetworkVariable, useNetworkVariables } = createNetworkConfig({
  testnet: {
    url: getFullnodeUrl("testnet"),
    variables: {
      counterPackageId: "0x8773ad4142fe6e85dbdb6c178d956ac50ce56f09938bd10e6721e59d0a1052b4",
      sealPackageId: "0x73bba649fe918ef501e2fb6ab82e83450a4c286f52cf3399e678e6da257f0c50",
      suiPackageId: "0x2",
    },
  },
  devnet: {
    url: getFullnodeUrl("devnet"),
    variables: {
      counterPackageId: "0x18903370f68278e20c29cede4a89785accc7b5299e3350b6790f1db76e4b4667",
      suiPackageId: "0x2",
    },
  },
  mainnet: {
    url: getFullnodeUrl("mainnet"),
    variables: {
      counterPackageId: "", // 未デプロイ
      suiPackageId: "0x2",
    },
  },
});

export { networkConfig, useNetworkVariable, useNetworkVariables };
export type NetworkVariables = {
  counterPackageId: string;
  sealPackageId?: string;
  suiPackageId: string;
};
