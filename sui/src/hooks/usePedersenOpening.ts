/**
 * Pedersen Opening Hook
 *
 * Provides functionality to "open" (reveal) Pedersen commitments
 * by retrieving stored secrets and verifying against on-chain data
 */

import consola from "consola";
import { ResultAsync } from "neverthrow";
import { useState } from "react";
import { openCommitment } from "@/utils/pedersen";
import { calculateTotals, hasSecrets } from "@/utils/pedersenStorage";

export interface OpeningResult {
  success: boolean;
  value?: bigint;
  error?: string;
}

export function usePedersenOpening() {
  const [isOpening, setIsOpening] = useState(false);

  /**
   * Check if we have secrets stored for a counter
   */
  const checkHasSecrets = (counterId: string): boolean => {
    return hasSecrets(counterId);
  };

  /**
   * Attempt to open a commitment
   * @param counterId - The counter ID
   * @param onchainCommitmentBytes - The commitment bytes from on-chain (number[])
   * @returns Opening result with value if successful
   */
  const open = async (
    counterId: string,
    onchainCommitmentBytes: number[],
  ): Promise<OpeningResult> => {
    setIsOpening(true);

    const result = await ResultAsync.fromPromise(
      Promise.resolve().then(() => {
        // Get stored secrets
        const totals = calculateTotals(counterId);

        if (!totals) {
          throw new Error(
            "No secrets found for this counter. Secrets may have been cleared or this counter was created on another device/browser.",
          );
        }

        const { totalValue, totalBlinding } = totals;

        // Verify the commitment
        const isValid = openCommitment(totalValue, totalBlinding, onchainCommitmentBytes);

        if (!isValid) {
          throw new Error(
            "Commitment verification failed. The stored secrets do not match the on-chain commitment.",
          );
        }

        return totalValue;
      }),
      (error) => new Error(error instanceof Error ? error.message : "Unknown error during opening"),
    );

    setIsOpening(false);

    if (result.isErr()) {
      consola.error("[usePedersenOpening] Error during opening:", result.error);
      return {
        success: false,
        error: result.error.message,
      };
    }

    return {
      success: true,
      value: result.value,
    };
  };

  return {
    open,
    checkHasSecrets,
    isOpening,
  };
}

export type PedersenOpeningHook = ReturnType<typeof usePedersenOpening>;
