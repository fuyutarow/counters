import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import consola from "consola";
import { z } from "zod";
import { useNetworkVariable } from "@/networkConfig";

// Zod schema for PedersenCounter validation
const PedersenCounterSchema = z.object({
  id: z.object({
    id: z.string(),
  }),
  commitment: z.object({
    bytes: z.array(z.number()),
  }),
});

export type PedersenCounterData = {
  id: string;
  commitmentBytes: number[];
  version: string;
};

export function usePedersenCounterList() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const counterPackageId = useNetworkVariable("counterPackageId");

  const counterType = `${counterPackageId}::pedersen_counter::PedersenCounter`;

  return useQuery({
    queryKey: ["pedersen-counters", account?.address, counterType],
    queryFn: async (): Promise<PedersenCounterData[]> => {
      if (!account?.address) return [];

      consola.info("[usePedersenCounterList] Querying with RPC API:", {
        owner: account.address,
        type: counterType,
        packageId: counterPackageId,
      });

      const result = await suiClient.getOwnedObjects({
        owner: account.address,
        filter: {
          StructType: counterType,
        },
        options: {
          showType: true,
          showContent: true,
        },
      });

      consola.info("[usePedersenCounterList] RPC response:", {
        count: result.data.length,
        hasNextPage: result.hasNextPage,
      });

      const counters: PedersenCounterData[] = [];

      for (const obj of result.data) {
        if (!obj.data) {
          consola.warn("[usePedersenCounterList] Object has no data:", obj);
          continue;
        }

        const { objectId, version, content } = obj.data;

        if (!content || content.dataType !== "moveObject") {
          consola.warn("[usePedersenCounterList] Object is not a Move object:", objectId);
          continue;
        }

        const parseResult = PedersenCounterSchema.safeParse(content.fields);
        if (!parseResult.success) {
          consola.warn("[usePedersenCounterList] Invalid PedersenCounter data:", {
            objectId,
            error: parseResult.error.format(),
            rawData: content.fields,
          });
          continue;
        }

        counters.push({
          id: objectId,
          commitmentBytes: parseResult.data.commitment.bytes,
          version,
        });
      }

      consola.info("[usePedersenCounterList] Parsed Pedersen counters:", counters.length);

      return counters;
    },
    enabled: !!account?.address && !!counterPackageId,
  });
}
