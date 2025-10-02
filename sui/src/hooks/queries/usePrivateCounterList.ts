import { useCurrentAccount, useSuiClientContext } from "@mysten/dapp-kit";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { useQuery } from "@tanstack/react-query";
import consola from "consola";
import { z } from "zod";
import { getOwnedCountersQuery } from "@/graphql/counter-queries";
import { useNetworkVariable } from "@/networkConfig";
import { getGraphQLUrl, type Network } from "@/types/network";

// Zod schema for strict validation
const PrivateCounterSchema = z.object({
  salt_digest: z.union([z.string(), z.number(), z.bigint()]),
  value_digest: z.union([z.string(), z.number(), z.bigint()]),
});

interface ValidNode {
  contents: { json?: unknown };
  address: string;
  version: string | number;
}

function isValidNode(node: unknown): node is ValidNode {
  if (typeof node !== "object" || node === null) return false;
  if (!("address" in node) || !("version" in node) || !("contents" in node)) return false;

  const typedNode = node as { address: unknown; contents: unknown; version: unknown };
  return (
    typeof typedNode.address === "string" &&
    typeof typedNode.contents === "object" &&
    typedNode.contents !== null
  );
}

export type PrivateCounterData = {
  id: string;
  saltHash: string;
  valueHash: string;
  version: string;
};

function parsePrivateCounterData(
  contents: { json?: unknown },
  nodeAddress: string,
  nodeVersion: string | number,
): PrivateCounterData | null {
  if (!contents.json) return null;

  const result = PrivateCounterSchema.safeParse(contents.json);
  if (!result.success) {
    consola.warn("Invalid PrivateCounter data:", result.error.format());
    return null;
  }

  return {
    id: nodeAddress,
    saltHash: String(result.data.salt_digest),
    valueHash: String(result.data.value_digest),
    version: String(nodeVersion),
  };
}

export function usePrivateCounterList() {
  const account = useCurrentAccount();
  const counterPackageId = useNetworkVariable("counterPackageId");
  const { network } = useSuiClientContext();

  const gqlClient = new SuiGraphQLClient({
    url: getGraphQLUrl(network as Network),
  });

  const counterType = `${counterPackageId}::private_counter::PrivateCounter`;

  return useQuery({
    queryKey: ["private-counters", account?.address, counterType],
    queryFn: async (): Promise<PrivateCounterData[]> => {
      if (!account?.address) return [];

      consola.info("[usePrivateCounterList] Querying:", {
        owner: account.address,
        type: counterType,
        packageId: counterPackageId,
      });

      const result = await gqlClient.query({
        query: getOwnedCountersQuery,
        variables: {
          owner: account.address,
          type: counterType,
        },
      });

      if (result.errors && result.errors.length > 0) {
        throw new Error(`GraphQL error: ${result.errors[0]?.message ?? "Unknown error"}`);
      }

      const counters: PrivateCounterData[] = [];

      const nodes =
        (result.data as { address?: { objects?: { nodes?: unknown[] } } })?.address?.objects
          ?.nodes ?? [];

      consola.info("[usePrivateCounterList] Found nodes:", nodes.length);

      for (const node of nodes) {
        if (isValidNode(node)) {
          const counterData = parsePrivateCounterData(
            node.contents,
            node.address,
            node.version ?? "0",
          );
          if (counterData) {
            counters.push(counterData);
          }
        }
      }

      consola.info("[usePrivateCounterList] Parsed counters:", counters.length);

      return counters;
    },
    enabled: !!account?.address && !!counterPackageId,
  });
}
