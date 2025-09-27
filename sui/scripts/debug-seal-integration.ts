/**
 * Debug Seal SDK integration to verify package ID usage
 */

import { getKeypair } from "../__tests__/utils/keybook.js";
import { SealMultiIBSAggregator } from "./multi-ibs-with-seal.ts";

const debugSealIntegration = async () => {
  // Use same setup as tests
  const primeKeyInfo = getKeypair("PRIME");
  const keypair = primeKeyInfo.keypair;
  const sealAggregator = new SealMultiIBSAggregator();

  // Fixed values for debugging
  const counterId = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const message = "test-debug-message";
  const THRESHOLD = 2;

  try {
    // This will trigger our debug logs in fetchSecretKeyShares
    const keyShares = await sealAggregator.fetchSecretKeyShares(
      counterId,
      keypair,
      message,
      THRESHOLD,
    );
    keyShares.forEach((_share, _i) => {});
  } catch (_error) {}
};

// Run debug
debugSealIntegration().catch(console.error);
