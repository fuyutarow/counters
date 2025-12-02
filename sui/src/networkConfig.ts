import { createNetworkConfig } from "@mysten/dapp-kit";

import { counterNetworkDefinitions, type NetworkVariables } from "./networkConstants";

const { networkConfig, useNetworkVariable, useNetworkVariables } = createNetworkConfig({
  testnet: counterNetworkDefinitions.testnet,
  devnet: counterNetworkDefinitions.devnet,
  mainnet: counterNetworkDefinitions.mainnet,
});

export { networkConfig, useNetworkVariable, useNetworkVariables };
export type { NetworkVariables };
