/**
 * Pedersen Counter Hook
 *
 * Provides operations for Pedersen commitment-based counters:
 * - Create counter with initial commitment
 * - Increment counter homomorphically
 * - Query commitment bytes
 */

import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { type SuiObjectChange } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as pedersenCounter from "@/generated/counter/pedersen_counter";
import { useNetworkVariable } from "@/networkConfig";
import { createSerializedCommitment } from "@/utils/pedersen";

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

export function usePedersenCounter() {
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

  // ================== Create Pedersen Counter ==================
  const createPedersenCounter = useMutation({
    mutationKey: ["counter", "pedersen", "create"],
    mutationFn: async (params?: { initialValue?: bigint }): Promise<string> => {
      if (!account?.address) {
        throw new Error("No account connected");
      }

      const initialValue = params?.initialValue ?? 0n;

      // Create initial commitment
      const { commitment, bytes } = createSerializedCommitment(initialValue);

      toast.info("Creating Pedersen commitment", {
        description: `Value: ${initialValue}, Blinding: ${commitment.blinding.toString(16).slice(0, 8)}...`,
      });

      const tx = new Transaction();
      const counter = pedersenCounter._new({
        package: counterPackageId,
        arguments: [bytes],
      })(tx);
      tx.transferObjects([counter], account.address);

      const result = await executeTransaction({ transaction: tx });
      const created = result.objectChanges?.find((c: SuiObjectChange) => c.type === "created");

      if (!created || created.type !== "created") {
        throw new Error("Failed to create Pedersen counter");
      }

      showTxSuccessToast("Pedersen counter created successfully!", result.digest);
      await queryClient.invalidateQueries({ queryKey: ["pedersen-counters"] });

      return created.objectId;
    },
    onError: (error) => {
      toast.error("Failed to create Pedersen counter", {
        description: error.message,
      });
    },
  });

  // ================== Increment Pedersen Counter ==================
  const incrementPedersenCounter = useMutation({
    mutationKey: ["counter", "pedersen", "increment"],
    mutationFn: async (params: { counterId: string; incrementValue: bigint }): Promise<void> => {
      // Create commitment for the increment value
      const { commitment, bytes } = createSerializedCommitment(params.incrementValue);

      toast.info("Creating increment commitment", {
        description: `Increment: ${params.incrementValue}, Blinding: ${commitment.blinding.toString(16).slice(0, 8)}...`,
      });

      const tx = new Transaction();
      pedersenCounter.increment({
        package: counterPackageId,
        arguments: [tx.object(params.counterId), bytes],
      })(tx);

      const result = await executeTransaction({ transaction: tx });

      showTxSuccessToast(
        `Counter incremented by ${params.incrementValue} homomorphically!`,
        result.digest,
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["counter", params.counterId] }),
        queryClient.invalidateQueries({ queryKey: ["pedersen-counters"] }),
      ]);
    },
    onError: (error) => {
      toast.error("Failed to increment Pedersen counter", {
        description: error.message,
      });
    },
  });

  // ================== Query Commitment Bytes ==================
  const queryCommitmentBytes = useMutation({
    mutationKey: ["counter", "pedersen", "queryBytes"],
    mutationFn: async (counterId: string): Promise<Uint8Array> => {
      const obj = await suiClient.getObject({
        id: counterId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
        throw new Error("Invalid counter object");
      }

      const fields = obj.data.content.fields as Record<string, unknown>;
      const commitment = fields.commitment as Record<string, unknown>;

      // Extract bytes from the Element field
      if (!commitment || typeof commitment !== "object" || !("bytes" in commitment)) {
        throw new Error("Invalid commitment structure");
      }

      const bytes = commitment.bytes as number[];
      return new Uint8Array(bytes);
    },
    onError: (error) => {
      toast.error("Failed to query commitment bytes", {
        description: error.message,
      });
    },
  });

  // ================== Unified API ==================
  return {
    create: createPedersenCounter.mutateAsync,
    increment: incrementPedersenCounter.mutateAsync,
    queryBytes: queryCommitmentBytes.mutateAsync,
    isPending: {
      create: createPedersenCounter.isPending,
      increment: incrementPedersenCounter.isPending,
      queryBytes: queryCommitmentBytes.isPending,
    },
  };
}

// Type exports
export type PedersenCounterHookResult = ReturnType<typeof usePedersenCounter>;
