import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import consola from "consola";
import { z } from "zod";
import { useNetworkVariable } from "@/networkConfig";

// Zod schema for strict validation
const OwnedCounterSchema = z.object({
  value: z.union([z.string(), z.number(), z.bigint()]),
});

export type OwnedCounterData = {
  id: string;
  value: string;
  version: string;
};

export function useOwnedCounterList() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const counterPackageId = useNetworkVariable("counterPackageId");

  const counterType = `${counterPackageId}::owned_counter::OwnedCounter`;

  return useQuery({
    queryKey: ["owned-counters", account?.address, counterType],
    queryFn: async (): Promise<OwnedCounterData[]> => {
      if (!account?.address) return [];

      consola.info("[useOwnedCounterList] Querying with RPC API:", {
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

      consola.info("[useOwnedCounterList] RPC response:", {
        count: result.data.length,
        hasNextPage: result.hasNextPage,
      });

      const counters: OwnedCounterData[] = [];

      for (const obj of result.data) {
        if (!obj.data) {
          consola.warn("[useOwnedCounterList] Object has no data:", obj);
          continue;
        }

        const { objectId, version, content } = obj.data;

        if (!content || content.dataType !== "moveObject") {
          consola.warn("[useOwnedCounterList] Object is not a Move object:", objectId);
          continue;
        }

        const parseResult = OwnedCounterSchema.safeParse(content.fields);
        if (!parseResult.success) {
          consola.warn("[useOwnedCounterList] Invalid OwnedCounter data:", {
            objectId,
            error: parseResult.error.format(),
            rawData: content.fields,
          });
          continue;
        }

        counters.push({
          id: objectId,
          value: String(parseResult.data.value),
          version,
        });
      }

      consola.info("[useOwnedCounterList] Parsed counters:", counters.length);

      return counters;
    },
    enabled: !!account?.address && !!counterPackageId,
  });
}
