import { useCurrentAccount, useSuiClientContext } from "@mysten/dapp-kit";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { useQuery } from "@tanstack/react-query";
import consola from "consola";
import { z } from "zod";
import { getOwnedCountersQuery } from "@/graphql/counter-queries";
import { useNetworkVariable } from "@/networkConfig";
import { getGraphQLUrl, type Network } from "@/types/network";

// Zod schema for strict validation
const OwnedCounterSchema = z.object({
  id: z.object({ id: z.string() }),
  value: z.union([z.string(), z.number(), z.bigint()]),
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

export type OwnedCounterData = {
  id: string;
  value: string;
  version: string;
};

function parseOwnedCounterData(
  contents: { json?: unknown },
  nodeAddress: string,
  nodeVersion: string | number,
): OwnedCounterData | null {
  if (!contents.json) return null;

  const result = OwnedCounterSchema.safeParse(contents.json);
  if (!result.success) {
    consola.warn("Invalid OwnedCounter data:", result.error.format());
    return null;
  }

  return {
    id: nodeAddress,
    value: String(result.data.value),
    version: String(nodeVersion),
  };
}

export function useOwnedCounterList() {
  const account = useCurrentAccount();
  const counterPackageId = useNetworkVariable("counterPackageId");
  const { network } = useSuiClientContext();

  const gqlClient = new SuiGraphQLClient({
    url: getGraphQLUrl(network as Network),
  });

  const counterType = `${counterPackageId}::owned_counter::OwnedCounter`;

  return useQuery({
    queryKey: ["owned-counters", account?.address, counterType],
    queryFn: async (): Promise<OwnedCounterData[]> => {
      if (!account?.address) return [];

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

      const counters: OwnedCounterData[] = [];

      const nodes =
        (result.data as { address?: { objects?: { nodes?: unknown[] } } })?.address?.objects
          ?.nodes ?? [];
      for (const node of nodes) {
        if (isValidNode(node)) {
          const counterData = parseOwnedCounterData(
            node.contents,
            node.address,
            node.version ?? "0",
          );
          if (counterData) {
            counters.push(counterData);
          }
        }
      }

      return counters;
    },
    enabled: !!account?.address && !!counterPackageId,
  });
}
