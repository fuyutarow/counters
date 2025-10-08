export type Network = "devnet" | "testnet" | "mainnet";

export const GRAPHQL_ENDPOINTS = {
  devnet: "https://graphql.devnet.sui.io/graphql",
  testnet: "https://graphql.testnet.sui.io/graphql",
  mainnet: "https://graphql.mainnet.sui.io/graphql",
} as const satisfies Record<Network, string>;

export const getGraphQLUrl = (network: Network): string => GRAPHQL_ENDPOINTS[network];
