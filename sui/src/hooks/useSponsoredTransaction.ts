/**
 * Hook for Enoki-sponsored transactions
 *
 * Uses `/api/tx/enoki` endpoint (Enoki API for sponsorship).
 */

import { toBase64 } from "@mysten/bcs";
import { useCurrentAccount, useCurrentWallet, useSuiClient } from "@mysten/dapp-kit";
import { type SuiTransactionBlockResponse } from "@mysten/sui/client";
import { type Transaction } from "@mysten/sui/transactions";
import { useMutation } from "@tanstack/react-query";
import consola from "consola";
import { toast } from "sonner";

type SponsoredTransactionOptions = {
  onSuccess?: (digest: string) => void;
  onError?: (error: Error) => void;
  showNotifications?: boolean;
};

type SponsoredTransactionResult = Omit<
  ReturnType<typeof useMutation<SuiTransactionBlockResponse, Error, Transaction>>,
  never
>;

export function useSponsoredTransaction(
  options?: SponsoredTransactionOptions,
): SponsoredTransactionResult {
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
      consola.info(`[Enoki] 1. Build transaction: ${buildTime.toFixed(0)}ms`);

      const transactionKindBytesBase64 = toBase64(transactionKindBytes);
      const apiUrl =
        typeof window !== "undefined" ? `${window.location.origin}/api/tx/enoki` : "/api/tx/enoki";

      // Step 2: Request sponsorship
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
          allowedAddresses: [account.address],
        }),
      });

      if (!sponsorResponse.ok) {
        const errorData = await sponsorResponse.json().catch(() => undefined);
        throw new Error(errorData?.error || "Failed to sponsor transaction");
      }

      const { bytes, digest } = (await sponsorResponse.json()) as {
        bytes: string;
        digest: string;
      };
      const sponsorTime = performance.now() - sponsorStart;
      consola.info(`[Enoki] 2. Request sponsorship (API POST): ${sponsorTime.toFixed(0)}ms`);

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
      consola.info(`[Enoki] 3. Sign transaction (wallet): ${signTime.toFixed(0)}ms`);

      // Step 4: Execute sponsored transaction
      const executeStart = performance.now();
      const executeResponse = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          digest,
          signature: signResponse.signature,
          network: "testnet",
        }),
      });

      if (!executeResponse.ok) {
        const errorData = await executeResponse.json().catch(() => undefined);
        throw new Error(errorData?.error || "Failed to execute sponsored transaction");
      }

      const executionResult = (await executeResponse.json()) as { digest: string };
      // Note: Enoki PUT includes POST + Finalize internally (we can't separate them)
      const enokiPostTime = performance.now() - executeStart;
      consola.info(`[Enoki] 4. PUT to Enoki (POST+Finalize): ${enokiPostTime.toFixed(0)}ms`);

      // Step 5: Finalize (additional wait on client, usually fast since Enoki already waited)
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
      consola.info(`[Enoki] 5. Finalize (client): ${finalizeTime.toFixed(0)}ms`);

      if (result.effects?.status?.status !== "success") {
        throw new Error(`Transaction failed: ${result.effects?.status?.error || "Unknown error"}`);
      }

      const totalTime = performance.now() - totalStart;
      const systemTime = buildTime + sponsorTime + enokiPostTime + finalizeTime;

      consola.box(
        `┌─ Enoki Sponsored Transaction ────────────────┐
│                                              │
│  1. Build:              ${buildTime.toFixed(0).padStart(5)}ms            │
│  2. Sponsor (POST):     ${sponsorTime.toFixed(0).padStart(5)}ms            │
│  3. Sign:               ${signTime.toFixed(0).padStart(5)}ms  ⏱️ user  │
│  4. PUT (POST+Finalize):${enokiPostTime.toFixed(0).padStart(5)}ms  ※Enoki内部 │
│  5. Finalize (client):  ${finalizeTime.toFixed(0).padStart(5)}ms            │
│                                              │
├──────────────────────────────────────────────┤
│  Total (wall clock):    ${totalTime.toFixed(0).padStart(5)}ms            │
│  System time only:      ${systemTime.toFixed(0).padStart(5)}ms            │
│  (excludes user approval wait)               │
│  ※ Enoki PUT = POST + Finalize 一体化        │
└──────────────────────────────────────────────┘`,
      );

      return result;
    },
    onSuccess: (result) => {
      if (showNotifications) {
        toast.success("Transaction successful! (Enoki)", {
          description: `Digest: ${result.digest}`,
        });
      }
      options?.onSuccess?.(result.digest);
    },
    onError: (error) => {
      consola.error(`[Enoki] Error: ${error.message}`);
      if (showNotifications) {
        toast.error("Transaction failed", {
          description: error.message,
        });
      }
      options?.onError?.(error);
    },
  });
}
