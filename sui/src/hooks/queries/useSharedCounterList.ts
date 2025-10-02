import { useSuiClientContext } from "@mysten/dapp-kit";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { useQuery } from "@tanstack/react-query";
import consola from "consola";
import { z } from "zod";
import { getSharedCountersQuery } from "@/graphql/counter-queries";
import { useNetworkVariable } from "@/networkConfig";
import { getGraphQLUrl, type Network } from "@/types/network";

// Zod schema for strict validation
const SharedCounterSchema = z.object({
  value: z.union([z.string(), z.number(), z.bigint()]),
});

export type SharedCounterData = {
  id: string;
  value: string;
  version: string;
};

function parseSharedCounterData(
  contents: { json?: unknown },
  nodeAddress: string,
  nodeVersion: string | number,
): SharedCounterData | null {
  if (!contents.json) {
    consola.warn("No JSON content in SharedCounter node:", nodeAddress);
    return null;
  }

  consola.info("Raw SharedCounter data:", contents.json);

  const result = SharedCounterSchema.safeParse(contents.json);
  if (!result.success) {
    consola.warn("Invalid SharedCounter data:", result.error.format());
    consola.warn("Raw data was:", contents.json);
    return null;
  }

  return {
    id: nodeAddress,
    value: String(result.data.value),
    version: String(nodeVersion),
  };
}

export function useSharedCounterList() {
  const counterPackageId = useNetworkVariable("counterPackageId");
  const { network } = useSuiClientContext();

  const gqlClient = new SuiGraphQLClient({
    url: getGraphQLUrl(network as Network),
  });

  const counterType = `${counterPackageId}::shared_counter::SharedCounter`;

  return useQuery({
    queryKey: ["shared-counters", counterType],
    queryFn: async (): Promise<SharedCounterData[]> => {
      consola.info("[useSharedCounterList] Querying:", {
        type: counterType,
        packageId: counterPackageId,
      });

      const result = await gqlClient.query({
        query: getSharedCountersQuery,
        variables: {
          type: counterType,
        },
      });

      if (result.errors && result.errors.length > 0) {
        throw new Error(`GraphQL error: ${result.errors[0]?.message}`);
      }

      const counters: SharedCounterData[] = [];

      const data = result.data as { objects?: { nodes?: unknown[] } };
      consola.info("[useSharedCounterList] Found nodes:", data?.objects?.nodes?.length ?? 0);

      if (data?.objects?.nodes) {
        for (const nodeItem of data.objects.nodes) {
          const node = nodeItem as {
            asMoveObject?: {
              contents?: {
                json?: unknown;
                type?: { repr?: string };
              };
            };
            address?: string;
            version?: string | number;
          };

          if (
            node?.asMoveObject?.contents &&
            node.address &&
            node.version &&
            typeof node.asMoveObject.contents === "object" &&
            node.asMoveObject.contents !== null
          ) {
            const contents = node.asMoveObject.contents;
            if (!contents.json) continue;

            const counterData = parseSharedCounterData(
              contents,
              node.address,
              String(node.version ?? undefined),
            );
            if (counterData) {
              counters.push(counterData);
            }
          }
        }
      }

      consola.info("[useSharedCounterList] Parsed counters:", counters.length);

      return counters;
    },
    enabled: !!counterPackageId,
  });
}
