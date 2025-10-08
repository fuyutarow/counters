import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import consola from "consola";
import { z } from "zod";
import { blobIdFromInt } from "@/lib/walrusClient";
import { useNetworkVariable } from "@/networkConfig";

// Zod schema for WalrusCounter
const WalrusCounterSchema = z.object({
  blob: z.object({
    fields: z.object({
      blob_id: z.union([z.string(), z.number()]),
    }),
  }),
});

export type WalrusCounterData = {
  id: string;
  blobId: string;
  version: string;
};

export function useWalrusCounterList() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const counterPackageId = useNetworkVariable("counterPackageId");

  const counterType = `${counterPackageId}::walrus_counter::WalrusCounter`;

  return useQuery({
    queryKey: ["walrus-counters", account?.address, counterType],
    queryFn: async (): Promise<WalrusCounterData[]> => {
      if (!account?.address) return [];

      consola.info("[useWalrusCounterList] Querying with RPC API:", {
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

      consola.info("[useWalrusCounterList] RPC response:", {
        count: result.data.length,
        hasNextPage: result.hasNextPage,
      });

      const counters: WalrusCounterData[] = [];

      for (const obj of result.data) {
        if (!obj.data) {
          consola.warn("[useWalrusCounterList] Object has no data:", obj);
          continue;
        }

        const { objectId, version, content } = obj.data;

        if (!content || content.dataType !== "moveObject") {
          consola.warn("[useWalrusCounterList] Object is not a Move object:", objectId);
          continue;
        }

        const parseResult = WalrusCounterSchema.safeParse(content.fields);
        if (!parseResult.success) {
          consola.warn("[useWalrusCounterList] Invalid WalrusCounter data:", {
            objectId,
            error: parseResult.error.format(),
            rawData: content.fields,
          });
          continue;
        }

        const rawBlobId = parseResult.data.blob.fields.blob_id;
        const blobId =
          typeof rawBlobId === "string" && /[A-Za-z_-]/.test(rawBlobId)
            ? rawBlobId
            : blobIdFromInt(typeof rawBlobId === "number" ? BigInt(rawBlobId) : rawBlobId);

        counters.push({
          id: objectId,
          blobId,
          version,
        });
      }

      consola.info("[useWalrusCounterList] Parsed counters:", counters.length);

      return counters;
    },
    enabled: !!account?.address && !!counterPackageId,
  });
}
