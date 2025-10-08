import { useQuery } from "@tanstack/react-query";
import consola from "consola";
import { z } from "zod";
import { useNetworkVariable } from "@/networkConfig";

// Zod schema for strict validation
const SharedCounterSchema = z.object({
  value: z.union([z.string(), z.number(), z.bigint()]),
});

export type SharedCounterData = {
  id: string;
  value: string;
  version: string;
};

export function useSharedCounterList() {
  const counterPackageId = useNetworkVariable("counterPackageId");

  const counterType = `${counterPackageId}::shared_counter::SharedCounter`;
  // Current network is hardcoded to testnet in providers.tsx
  const network = "testnet";

  return useQuery({
    queryKey: ["shared-counters", counterType, network],
    queryFn: async (): Promise<SharedCounterData[]> => {
      consola.info("[useSharedCounterList] Querying with GraphQL API:", {
        type: counterType,
        packageId: counterPackageId,
        network,
      });

      const response = await fetch(
        `/api/shared-counters?type=${encodeURIComponent(counterType)}&network=${network}`,
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch shared counters");
      }

      const data = await response.json();
      const counters: SharedCounterData[] = [];

      for (const counter of data.counters || []) {
        const parseResult = SharedCounterSchema.safeParse({ value: counter.value });
        if (!parseResult.success) {
          consola.warn("[useSharedCounterList] Invalid SharedCounter data:", {
            id: counter.id,
            error: parseResult.error.format(),
            rawData: counter,
          });
          continue;
        }

        counters.push({
          id: counter.id,
          value: String(parseResult.data.value),
          version: counter.version,
        });
      }

      consola.info("[useSharedCounterList] Parsed counters:", counters.length);

      return counters;
    },
    enabled: !!counterPackageId,
  });
}
