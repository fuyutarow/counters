/**
 * WalrusCounter hook following OwnedCounter pattern
 *
 * Key differences from OwnedCounter:
 * - Blob propagation delay (15s from test learning)
 * - Off-chain storage via Walrus
 */

import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { type SuiObjectChange } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ResultAsync } from "neverthrow";
import { toast } from "sonner";
import { z } from "zod";
import * as walrusCounter from "@/generated/counter/walrus_counter";
import { blobIdFromInt, createCounterBlob, readCounterValue } from "@/lib/walrusClient";
import { useNetworkVariable } from "@/networkConfig";

const walrusCounterFieldsSchema = z.object({
  blob: z.object({
    fields: z.object({
      blob_id: z.union([z.string(), z.number()]),
    }),
  }),
});

const buildExplorerLink = (digest: string): string =>
  `https://testnet.suivision.xyz/txblock/${digest}`;

const showTxSuccessToast = (message: string, digest: string) => {
  toast.success(message, {
    description: (
      <a
        href={buildExplorerLink(digest)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 underline"
      >
        View transaction on SuiVision
      </a>
    ),
  });
};

// ================== WalrusCounter Value Query Hook ==================
export function useWalrusCounterValue(counterId?: string) {
  const suiClient = useSuiClient();

  return useQuery({
    queryKey: ["walrus-counter", counterId],
    queryFn: async () => {
      if (!counterId) return null;

      const obj = await suiClient.getObject({
        id: counterId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
        return null;
      }

      const parseResult = walrusCounterFieldsSchema.safeParse(obj.data.content.fields);

      if (!parseResult.success) {
        throw new Error(`Invalid WalrusCounter fields: ${parseResult.error.message}`);
      }

      const rawBlobId = parseResult.data.blob.fields.blob_id;

      // Convert blob_id to base64url format if needed
      const blobId =
        typeof rawBlobId === "string" && /[A-Za-z_-]/.test(rawBlobId)
          ? rawBlobId
          : blobIdFromInt(typeof rawBlobId === "number" ? BigInt(rawBlobId) : rawBlobId);

      // Read counter value from Walrus blob
      const readResult = await ResultAsync.fromPromise(
        readCounterValue(blobId),
        (error) =>
          new Error(
            `Failed to read blob from Walrus (blob_id: ${blobId}): ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
      );

      if (readResult.isErr()) {
        throw readResult.error;
      }

      return {
        id: counterId,
        blobId,
        value: String(readResult.value),
      };
    },
    enabled: !!counterId,
  });
}

// ================== Main WalrusCounter Hook ==================
export function useWalrusCounter() {
  const suiClient = useSuiClient();
  const { mutateAsync: executeTransaction } = useSignAndExecuteTransaction({
    execute: async ({ bytes, signature }) => {
      const executionResult = await suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: {
          showRawEffects: true,
          showObjectChanges: true,
        },
        requestType: "WaitForLocalExecution",
      });

      // Wait for transaction to complete (learned from OwnedCounter)
      return suiClient.waitForTransaction({
        digest: executionResult.digest,
        options: {
          showRawEffects: true,
          showObjectChanges: true,
        },
      });
    },
  });
  const queryClient = useQueryClient();
  const account = useCurrentAccount();
  const counterPackageId = useNetworkVariable("counterPackageId");

  // ================== Create WalrusCounter ==================
  const createWalrusCounter = useMutation({
    mutationKey: ["walrus-counter", "create"],
    mutationFn: async (): Promise<string> => {
      if (!account?.address) {
        throw new Error("No account connected");
      }

      toast.info("Creating Walrus blob...");
      const blobObjectId = await createCounterBlob(0, account.address);

      // Wait for blob propagation (learned from tests)
      toast.info("Waiting for blob propagation...");
      await new Promise((resolve) => setTimeout(resolve, 15000));

      toast.info("Creating WalrusCounter on-chain...");
      const tx = new Transaction();
      const counter = walrusCounter._new({
        package: counterPackageId,
        arguments: [tx.object(blobObjectId)],
      })(tx);
      tx.transferObjects([counter], account.address);

      const result = await executeTransaction({ transaction: tx });
      const created = result.objectChanges?.find((c: SuiObjectChange) => c.type === "created");

      if (!created || created.type !== "created") {
        throw new Error("Failed to create WalrusCounter");
      }

      showTxSuccessToast("WalrusCounter created successfully!", result.digest);
      await queryClient.invalidateQueries({ queryKey: ["walrus-counters"] });

      return created.objectId;
    },
    onError: (error) => {
      toast.error("Failed to create WalrusCounter", {
        description: error.message,
      });
    },
  });

  // ================== Increment WalrusCounter ==================
  const incrementWalrusCounter = useMutation({
    mutationKey: ["walrus-counter", "increment"],
    mutationFn: async (params: { counterId: string; currentValue: number }): Promise<void> => {
      if (!account?.address) {
        throw new Error("No account connected");
      }

      // Create new blob with incremented value
      toast.info("Creating new blob...");
      const newBlobObjectId = await createCounterBlob(params.currentValue + 1, account.address);

      // Wait for blob propagation (learned from tests)
      toast.info("Waiting for blob propagation...");
      await new Promise((resolve) => setTimeout(resolve, 15000));

      // Replace blob in counter
      toast.info("Updating counter on-chain...");
      const tx = new Transaction();
      const oldBlob = walrusCounter.replace({
        package: counterPackageId,
        arguments: [tx.object(params.counterId), tx.object(newBlobObjectId)],
      })(tx);
      tx.transferObjects([oldBlob], account.address);

      const result = await executeTransaction({ transaction: tx });

      showTxSuccessToast("Counter incremented successfully!", result.digest);

      // Invalidate queries (learned from OwnedCounter)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["walrus-counter", params.counterId] }),
        queryClient.invalidateQueries({ queryKey: ["walrus-counters"] }),
      ]);
    },
    onError: (error) => {
      toast.error("Failed to increment counter", {
        description: error.message,
      });
    },
  });

  // ================== Set WalrusCounter Value ==================
  const setWalrusCounterValue = useMutation({
    mutationKey: ["walrus-counter", "setValue"],
    mutationFn: async (params: { counterId: string; value: number }): Promise<void> => {
      if (!account?.address) {
        throw new Error("No account connected");
      }

      // Create new blob with target value
      toast.info("Creating new blob...");
      const newBlobObjectId = await createCounterBlob(params.value, account.address);

      // Wait for blob propagation (learned from tests)
      toast.info("Waiting for blob propagation...");
      await new Promise((resolve) => setTimeout(resolve, 15000));

      // Replace blob in counter
      toast.info("Updating counter on-chain...");
      const tx = new Transaction();
      const oldBlob = walrusCounter.replace({
        package: counterPackageId,
        arguments: [tx.object(params.counterId), tx.object(newBlobObjectId)],
      })(tx);
      tx.transferObjects([oldBlob], account.address);

      const result = await executeTransaction({ transaction: tx });

      showTxSuccessToast(`Counter set to ${params.value}!`, result.digest);

      // Invalidate queries (learned from OwnedCounter)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["walrus-counter", params.counterId] }),
        queryClient.invalidateQueries({ queryKey: ["walrus-counters"] }),
      ]);
    },
    onError: (error) => {
      toast.error("Failed to set counter value", {
        description: error.message,
      });
    },
  });

  // ================== Unified API ==================
  return {
    create: createWalrusCounter.mutateAsync,
    increment: incrementWalrusCounter.mutateAsync,
    setValue: setWalrusCounterValue.mutateAsync,
    useValue: useWalrusCounterValue,
    isPending: {
      create: createWalrusCounter.isPending,
      increment: incrementWalrusCounter.isPending,
      setValue: setWalrusCounterValue.isPending,
    },
  };
}

// Type exports
export type WalrusCounterHookResult = ReturnType<typeof useWalrusCounter>;
