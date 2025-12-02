import { getFullnodeUrl } from "@mysten/sui/client";

/**
 * Centralized network definitions.
 * This is the single source of truth for all package IDs and network URLs.
 * Both client-side code (via networkConfig.ts) and server-side code (via API routes)
 * should import from here.
 */
export const counterNetworkDefinitions = {
  testnet: {
    url: getFullnodeUrl("testnet"),
    variables: {
      suiPackageId: "0x2",
      counterPackageId: "0x50cb3285306eea84ce5a721642f6099ce8890389b154d232df9159ed2594a45f",
      walrusPackageId: "0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66",
    },
  },
  devnet: {
    url: getFullnodeUrl("devnet"),
    variables: {
      suiPackageId: "0x2",
      counterPackageId: "0x18903370f68278e20c29cede4a89785accc7b5299e3350b6790f1db76e4b4667",
      walrusPackageId: "",
    },
  },
  mainnet: {
    url: getFullnodeUrl("mainnet"),
    variables: {
      suiPackageId: "0x2",
      counterPackageId: "",
      walrusPackageId: "0x2c68824c0c9bd9527e072cfc250beb8d6b668f1bc8e0cf6e18e6428ee7b6c3ff",
    },
  },
} as const;

export type NetworkName = keyof typeof counterNetworkDefinitions;
export type NetworkVariables = (typeof counterNetworkDefinitions)[NetworkName]["variables"];
