/**
 * Hook for self-sponsored transactions (backend pays gas directly)
 *
 * Uses `/api/tx/self` endpoint where the backend signs with its own keypair.
 */

import { toBase64 } from "@mysten/bcs";
import { useCurrentAccount, useCurrentWallet, useSuiClient } from "@mysten/dapp-kit";
import { type SuiTransactionBlockResponse } from "@mysten/sui/client";
import { type Transaction } from "@mysten/sui/transactions";
import { useMutation } from "@tanstack/react-query";
import consola from "consola";
import { toast } from "sonner";

type SelfSponsoredTransactionOptions = {
  onSuccess?: (digest: string) => void;
  onError?: (error: Error) => void;
  showNotifications?: boolean;
};

type SelfSponsoredTransactionResult = Omit<
  ReturnType<typeof useMutation<SuiTransactionBlockResponse, Error, Transaction>>,
  never
>;

export function useSelfSponsoredTransaction(
  options?: SelfSponsoredTransactionOptions,
): SelfSponsoredTransactionResult {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { currentWallet } = useCurrentWallet();

  const showNotifications = options?.showNotifications !== false;

  return useMutation({
    mutationFn: async (transaction: Transaction) => {
      const totalStart = performance.now();

      if (!account?.address) {
        throw new Error("No wallet connected");
      }

      const signFeature = currentWallet?.features["sui:signTransaction"];
      if (!signFeature) {
        throw new Error("Current wallet cannot sign transactions");
      }

      // Step 1: Build transaction
      const buildStart = performance.now();
      const transactionKindBytes = await transaction.build({
        client,
        onlyTransactionKind: true,
      });
      const buildTime = performance.now() - buildStart;
      consola.info(`[Self] 1. Build transaction: ${buildTime.toFixed(0)}ms`);

      const transactionKindBytesBase64 = toBase64(transactionKindBytes);
      const apiUrl =
        typeof window !== "undefined" ? `${window.location.origin}/api/tx/self` : "/api/tx/self";

      // Step 2: Request sponsorship from backend
      const sponsorStart = performance.now();
      const sponsorResponse = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactionKindBytes: transactionKindBytesBase64,
          sender: account.address,
          network: "testnet",
        }),
      });

      if (!sponsorResponse.ok) {
        const errorData = await sponsorResponse.json().catch(() => undefined);
        throw new Error(errorData?.error || "Failed to create sponsored transaction");
      }

      const { bytes, digest } = (await sponsorResponse.json()) as {
        bytes: string;
        digest: string;
        sponsor: string;
      };
      const sponsorTime = performance.now() - sponsorStart;
      consola.info(`[Self] 2. Create sponsored tx (API POST): ${sponsorTime.toFixed(0)}ms`);

      // Step 3: Sign transaction
      const signStart = performance.now();
      const signResponse = await signFeature.signTransaction({
        transaction: {
          toJSON: async () => bytes,
        },
        account,
        chain: "sui:testnet",
      });

      if (!signResponse?.signature) {
        throw new Error("Failed to sign transaction");
      }
      const signTime = performance.now() - signStart;
      consola.info(`[Self] 3. Sign transaction (wallet): ${signTime.toFixed(0)}ms`);

      // Step 4: Execute with both signatures (user + sponsor)
      const executeStart = performance.now();
      const executeResponse = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          digest,
          signature: signResponse.signature,
        }),
      });

      if (!executeResponse.ok) {
        const errorData = await executeResponse.json().catch(() => undefined);
        throw new Error(errorData?.error || "Failed to execute transaction");
      }

      const executionResult = (await executeResponse.json()) as { digest: string };
      const executeTime = performance.now() - executeStart;
      consola.info(`[Self] 4. Execute tx (API PUT): ${executeTime.toFixed(0)}ms`);

      // Step 5: Wait for transaction
      const waitStart = performance.now();
      const result = await client.waitForTransaction({
        digest: executionResult.digest,
        options: {
          showEffects: true,
          showObjectChanges: true,
          showEvents: true,
        },
      });
      const waitTime = performance.now() - waitStart;
      consola.info(`[Self] 5. Wait for transaction: ${waitTime.toFixed(0)}ms`);

      if (result.effects?.status?.status !== "success") {
        throw new Error(`Transaction failed: ${result.effects?.status?.error || "Unknown error"}`);
      }

      const totalTime = performance.now() - totalStart;
      const systemTime = buildTime + sponsorTime + executeTime + waitTime;

      consola.box(
        `┌─ Self-Sponsored Transaction ─────────────────┐
│                                              │
│  1. Build:              ${buildTime.toFixed(0).padStart(5)}ms            │
│  2. Sponsor (POST):     ${sponsorTime.toFixed(0).padStart(5)}ms            │
│  3. Sign:               ${signTime.toFixed(0).padStart(5)}ms  ⏱️ user  │
│  4. Execute (PUT):      ${executeTime.toFixed(0).padStart(5)}ms            │
│  5. Wait for tx:        ${waitTime.toFixed(0).padStart(5)}ms            │
│                                              │
├──────────────────────────────────────────────┤
│  Total (wall clock):    ${totalTime.toFixed(0).padStart(5)}ms            │
│  System time only:      ${systemTime.toFixed(0).padStart(5)}ms            │
│  (excludes user approval wait)               │
└──────────────────────────────────────────────┘`,
      );

      return result;
    },
    onSuccess: (result) => {
      if (showNotifications) {
        toast.success("Transaction successful! (Self-Sponsored)", {
          description: `Digest: ${result.digest}`,
        });
      }
      options?.onSuccess?.(result.digest);
    },
    onError: (error) => {
      consola.error(`[Self] Error: ${error.message}`);
      if (showNotifications) {
        toast.error("Transaction failed", {
          description: error.message,
        });
      }
      options?.onError?.(error);
    },
  });
}
