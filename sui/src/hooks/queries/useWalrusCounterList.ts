import { useCurrentAccount, useSuiClientContext } from "@mysten/dapp-kit";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { useQuery } from "@tanstack/react-query";
import consola from "consola";
import { z } from "zod";
import { getOwnedCountersQuery } from "@/graphql/counter-queries";
import { useNetworkVariable } from "@/networkConfig";
import { getGraphQLUrl, type Network } from "@/types/network";

// Zod schema for WalrusCounter
const WalrusCounterSchema = z.object({
  blob: z.object({
    fields: z.object({
      blob_id: z.string(),
    }),
  }),
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

export type WalrusCounterData = {
  id: string;
  blobId: string;
  version: string;
};

function parseWalrusCounterData(
  contents: { json?: unknown },
  nodeAddress: string,
  nodeVersion: string | number,
): WalrusCounterData | null {
  if (!contents.json) {
    consola.warn("No JSON content in node:", nodeAddress);
    return null;
  }

  consola.info("Raw walrus counter data:", contents.json);

  const result = WalrusCounterSchema.safeParse(contents.json);
  if (!result.success) {
    consola.warn("Invalid WalrusCounter data:", result.error.format());
    consola.warn("Raw data was:", contents.json);
    return null;
  }

  return {
    id: nodeAddress,
    blobId: result.data.blob.fields.blob_id,
    version: String(nodeVersion),
  };
}

export function useWalrusCounterList() {
  const account = useCurrentAccount();
  const counterPackageId = useNetworkVariable("counterPackageId");
  const { network } = useSuiClientContext();

  const gqlClient = new SuiGraphQLClient({
    url: getGraphQLUrl(network as Network),
  });

  const counterType = `${counterPackageId}::walrus_counter::WalrusCounter`;

  return useQuery({
    queryKey: ["walrus-counters", account?.address, counterType],
    queryFn: async (): Promise<WalrusCounterData[]> => {
      if (!account?.address) return [];

      consola.info("[useWalrusCounterList] Querying:", {
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

      const counters: WalrusCounterData[] = [];

      const nodes =
        (result.data as { address?: { objects?: { nodes?: unknown[] } } })?.address?.objects
          ?.nodes ?? [];

      consola.info("[useWalrusCounterList] Found nodes:", nodes.length);

      for (const node of nodes) {
        if (isValidNode(node)) {
          const counterData = parseWalrusCounterData(
            node.contents,
            node.address,
            node.version ?? "0",
          );
          if (counterData) {
            counters.push(counterData);
          }
        }
      }

      consola.info("[useWalrusCounterList] Parsed counters:", counters.length);

      return counters;
    },
    enabled: !!account?.address && !!counterPackageId,
  });
}
