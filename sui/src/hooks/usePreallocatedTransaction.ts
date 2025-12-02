/**
 * Hook for 1RT sponsored transactions using pre-allocated coins
 *
 * Uses a pre-allocated coin from the sponsor for gas payment.
 * Client builds full transaction with known coin ID, reducing round trips.
 *
 * Flow:
 * 1. Ensure coin is allocated (one-time setup)
 * 2. Build full transaction with pre-allocated coin as gas
 * 3. Sign locally + submit with sponsor signature (single API call)
 */

import { toBase64 } from "@mysten/bcs";
import { useCurrentAccount, useCurrentWallet, useSuiClient } from "@mysten/dapp-kit";
import { type SuiTransactionBlockResponse } from "@mysten/sui/client";
import { type Transaction } from "@mysten/sui/transactions";
import { useMutation } from "@tanstack/react-query";
import consola from "consola";
import { toast } from "sonner";

import { useCoinAllocation } from "./useCoinAllocation";

type PreallocatedTransactionOptions = {
  onSuccess?: (digest: string) => void;
  onError?: (error: Error) => void;
  showNotifications?: boolean;
};

type PreallocatedTransactionResult = Omit<
  ReturnType<typeof useMutation<SuiTransactionBlockResponse, Error, Transaction>>,
  never
> & {
  allocation: ReturnType<typeof useCoinAllocation>["allocation"];
  hasAllocation: boolean;
  allocate: ReturnType<typeof useCoinAllocation>["allocate"];
  isAllocating: boolean;
};

export function usePreallocatedTransaction(
  options?: PreallocatedTransactionOptions,
): PreallocatedTransactionResult {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { currentWallet } = useCurrentWallet();

  const { allocation, hasAllocation, allocate, isAllocating, refreshCoin, clearAllocation } =
    useCoinAllocation();

  const showNotifications = options?.showNotifications !== false;

  const mutation = useMutation({
    mutationFn: async (transaction: Transaction) => {
      const totalStart = performance.now();

      if (!account?.address) {
        throw new Error("No wallet connected");
      }

      if (!allocation) {
        throw new Error("No coin allocated. Call allocate() first.");
      }

      if (!allocation.sponsor) {
        throw new Error("Allocation missing sponsor address. Please re-allocate.");
      }

      // Verify sender and gasOwner are different
      if (account.address === allocation.sponsor) {
        throw new Error(
          "Sender and gasOwner cannot be the same address for sponsored transactions.",
        );
      }

      const signFeature = currentWallet?.features["sui:signTransaction"];
      if (!signFeature) {
        throw new Error("Current wallet cannot sign transactions");
      }

      const apiUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/api/tx/self/execute-preallocated`
          : "/api/tx/self/execute-preallocated";

      // Step 1: Build transaction with pre-allocated coin as gas
      const buildStart = performance.now();

      // Set gas payment using pre-allocated coin
      transaction.setSender(account.address);
      transaction.setGasOwner(allocation.sponsor);
      transaction.setGasPayment([
        {
          objectId: allocation.coinId,
          version: allocation.version,
          digest: allocation.digest,
        },
      ]);

      // Set explicit gas budget to avoid dryRun RPC call
      // 10_000_000 MIST = 0.01 SUI (sufficient for most operations)
      transaction.setGasBudget(10_000_000n);

      // Debug: Log sender and gasOwner
      consola.info("[Prealloc] Transaction config", {
        sender: account.address,
        gasOwner: allocation.sponsor,
        coinId: allocation.coinId,
        isSameAddress: account.address === allocation.sponsor,
      });

      const txBytes = await transaction.build({ client });
      const buildTime = performance.now() - buildStart;
      consola.info(`[Prealloc] 1. Build tx with pre-allocated coin: ${buildTime.toFixed(0)}ms`);

      // Step 2: Sign transaction
      const signStart = performance.now();
      const signResponse = await signFeature.signTransaction({
        transaction: {
          toJSON: async () => toBase64(txBytes),
        },
        account,
        chain: "sui:testnet",
      });

      if (!signResponse?.signature) {
        throw new Error("Failed to sign transaction");
      }
      const signTime = performance.now() - signStart;
      consola.info(`[Prealloc] 2. Sign transaction (wallet): ${signTime.toFixed(0)}ms`);

      // Step 3: Execute with sponsor signature (single API call - 1RT!)
      const executeStart = performance.now();
      const executeResponse = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          txBytes: toBase64(txBytes),
          userSignature: signResponse.signature,
          userAddress: account.address,
          network: "testnet",
        }),
      });

      if (!executeResponse.ok) {
        const errorData = await executeResponse.json().catch(() => undefined);

        // Check if allocation is missing (server restart/HMR cleared the Map)
        if (executeResponse.status === 404) {
          consola.warn("[Prealloc] Allocation not found on server, need to re-allocate");
          clearAllocation(); // Clear client cache so UI shows "Need Allocation"
          throw new Error("Allocation expired. Please allocate again.");
        }

        // Check if it's a version mismatch error - need to refresh coin
        if (errorData?.error?.includes("version") || errorData?.needsRefresh) {
          consola.warn("[Prealloc] Coin version mismatch, refreshing...");
          await refreshCoin();
          throw new Error("Coin version changed. Please retry.");
        }

        throw new Error(errorData?.error || "Failed to execute transaction");
      }

      const executionResult = (await executeResponse.json()) as { digest: string };
      const postTime = performance.now() - executeStart;
      consola.info(`[Prealloc] 3. POST to API (1RT): ${postTime.toFixed(0)}ms`);

      // Step 4: Finalize (wait for transaction confirmation)
      const finalizeStart = performance.now();
      const result = await client.waitForTransaction({
        digest: executionResult.digest,
        options: {
          showEffects: true,
          showObjectChanges: true,
          showEvents: true,
        },
      });
      const finalizeTime = performance.now() - finalizeStart;
      consola.info(`[Prealloc] 4. Finalize: ${finalizeTime.toFixed(0)}ms`);

      if (result.effects?.status?.status !== "success") {
        throw new Error(`Transaction failed: ${result.effects?.status?.error || "Unknown error"}`);
      }

      // Refresh coin state after successful transaction
      await refreshCoin();

      const totalTime = performance.now() - totalStart;
      const systemTime = buildTime + postTime + finalizeTime;

      consola.box(
        `┌─ Pre-allocated 1RT Transaction ──────────────┐
│                                              │
│  1. Build (with coin):    ${buildTime.toFixed(0).padStart(5)}ms            │
│  2. Sign:                 ${signTime.toFixed(0).padStart(5)}ms  ⏱️ user  │
│  3. POST to API (1RT):    ${postTime.toFixed(0).padStart(5)}ms            │
│  4. Finalize:             ${finalizeTime.toFixed(0).padStart(5)}ms            │
│                                              │
├──────────────────────────────────────────────┤
│  Total (wall clock):      ${totalTime.toFixed(0).padStart(5)}ms            │
│  System time only:        ${systemTime.toFixed(0).padStart(5)}ms            │
│  (excludes user approval wait)               │
└──────────────────────────────────────────────┘`,
      );

      return result;
    },
    onSuccess: (result) => {
      if (showNotifications) {
        toast.success("Transaction successful! (Pre-allocated 1RT)", {
          description: `Digest: ${result.digest}`,
        });
      }
      options?.onSuccess?.(result.digest);
    },
    onError: (error) => {
      consola.error(`[Prealloc] Error: ${error.message}`);
      if (showNotifications) {
        toast.error("Transaction failed", {
          description: error.message,
        });
      }
      options?.onError?.(error);
    },
  });

  return {
    ...mutation,
    allocation,
    hasAllocation,
    allocate,
    isAllocating,
  };
}
