/**
 * Hook for fee-payer sponsored transactions (1RT)
 *
 * Uses `/api/tx/sponsor` endpoint for backend fee payment.
 *
 * Flow:
 * 1. Fetch sponsor pubkey from /info
 * 2. Build transaction with feePayer = sponsor
 * 3. User partial signs
 * 4. POST to /execute - backend signs and executes (1RT!)
 */

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { useMutation, useQuery } from "@tanstack/react-query";
import consola from "consola";
import { toast } from "sonner";

type SponsoredTransactionOptions = {
  onSuccess?: (signature: string) => void;
  onError?: (error: Error) => void;
  showNotifications?: boolean;
};

type SponsorInfo = {
  sponsor: string;
  network: string;
  balance: number;
  balanceSol: number;
};

/**
 * Hook to get sponsor info (pubkey, balance)
 */
export function useSponsorInfo() {
  return useQuery({
    queryKey: ["sponsor-info"],
    queryFn: async (): Promise<SponsorInfo> => {
      // Use localnet for local development
      const network = "localnet";
      const apiUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/api/tx/sponsor/info?network=${network}`
          : `/api/tx/sponsor/info?network=${network}`;

      const response = await fetch(apiUrl);
      if (!response.ok) {
        const errorData = await response.json().catch(() => undefined);
        throw new Error(errorData?.error || "Failed to get sponsor info");
      }

      return response.json();
    },
    staleTime: 60 * 1000, // Cache for 1 minute
  });
}

/**
 * Hook for executing sponsored transactions (1RT)
 */
export function useSponsoredTransaction(options?: SponsoredTransactionOptions) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { data: sponsorInfo } = useSponsorInfo();

  const showNotifications = options?.showNotifications !== false;

  const mutation = useMutation({
    mutationFn: async (instructions: TransactionInstruction[]) => {
      const totalStart = performance.now();

      if (!wallet.publicKey || !wallet.signTransaction) {
        throw new Error("Wallet not connected");
      }

      if (!sponsorInfo?.sponsor) {
        throw new Error("Sponsor info not available. Please wait for it to load.");
      }

      const sponsorPubkey = new PublicKey(sponsorInfo.sponsor);

      // Step 1: Get recent blockhash
      const blockhashStart = performance.now();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const blockhashTime = performance.now() - blockhashStart;
      consola.info(`[Sponsored] 1. Get blockhash: ${blockhashTime.toFixed(0)}ms`);

      // Step 2: Build transaction with sponsor as fee payer
      const buildStart = performance.now();
      const messageV0 = new TransactionMessage({
        payerKey: sponsorPubkey, // Sponsor pays the fee
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);
      const buildTime = performance.now() - buildStart;
      consola.info(`[Sponsored] 2. Build tx: ${buildTime.toFixed(0)}ms`);

      // Step 3: User partial sign
      const signStart = performance.now();
      // We need to sign with user wallet - use signTransaction for partial signing
      const userSignedTx = await wallet.signTransaction(transaction);
      const signTime = performance.now() - signStart;
      consola.info(`[Sponsored] 3. User sign (wallet): ${signTime.toFixed(0)}ms`);

      // Step 4: Send to backend for sponsor signature + execution (1RT)
      const executeStart = performance.now();
      const apiUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/api/tx/sponsor/execute`
          : "/api/tx/sponsor/execute";

      const serializedTx = Buffer.from(userSignedTx.serialize()).toString("base64");

      const executeResponse = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          txBytes: serializedTx,
          network: "localnet",
        }),
      });

      if (!executeResponse.ok) {
        const errorData = await executeResponse.json().catch(() => undefined);
        throw new Error(errorData?.error || "Failed to execute sponsored transaction");
      }

      const { signature, success } = (await executeResponse.json()) as {
        signature: string;
        success: boolean;
      };
      const postTime = performance.now() - executeStart;
      consola.info(`[Sponsored] 4. POST to API (1RT): ${postTime.toFixed(0)}ms`);

      if (!success) {
        throw new Error("Transaction execution failed");
      }

      // Step 5: Finalize (wait for confirmation on client)
      const finalizeStart = performance.now();
      await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed",
      );
      const finalizeTime = performance.now() - finalizeStart;
      consola.info(`[Sponsored] 5. Finalize: ${finalizeTime.toFixed(0)}ms`);

      const totalTime = performance.now() - totalStart;
      const systemTime = blockhashTime + buildTime + postTime + finalizeTime;

      consola.box(
        `┌─ Sponsored Transaction (1RT) ───────────────┐
│                                              │
│  1. Get blockhash:        ${blockhashTime.toFixed(0).padStart(5)}ms            │
│  2. Build tx:             ${buildTime.toFixed(0).padStart(5)}ms            │
│  3. User sign:            ${signTime.toFixed(0).padStart(5)}ms  ⏱️ user  │
│  4. POST to API (1RT):    ${postTime.toFixed(0).padStart(5)}ms            │
│  5. Finalize:             ${finalizeTime.toFixed(0).padStart(5)}ms            │
│                                              │
├──────────────────────────────────────────────┤
│  Total (wall clock):      ${totalTime.toFixed(0).padStart(5)}ms            │
│  System time only:        ${systemTime.toFixed(0).padStart(5)}ms            │
│  (excludes user approval wait)               │
└──────────────────────────────────────────────┘`,
      );

      return signature;
    },
    onSuccess: (signature) => {
      if (showNotifications) {
        toast.success("Transaction successful! (Sponsored)", {
          description: (
            <a
              href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-700"
            >
              View on Solana Explorer
            </a>
          ),
        });
      }
      options?.onSuccess?.(signature);
    },
    onError: (error) => {
      consola.error(`[Sponsored] Error: ${error.message}`);
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
    sponsorInfo,
    hasSponsor: !!sponsorInfo?.sponsor,
  };
}
