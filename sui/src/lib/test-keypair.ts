/**
 * Test Keypair Provider for Multi-IBS Testing
 *
 * This module provides Ed25519 keypairs for testing Multi-IBS signatures.
 * In production, these would come from the user's wallet connection.
 */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

/**
 * Generate a deterministic keypair for testing
 * In production, this would be replaced with wallet connection
 */
export function getTestKeypair(): Ed25519Keypair {
  // Generate a deterministic keypair for testing
  // The seed is hardcoded for consistency in tests
  const seed = new Uint8Array(32);
  seed[0] = 1; // Simple deterministic seed

  return Ed25519Keypair.fromSecretKey(seed);
}

/**
 * Get a keypair by name for testing purposes
 * This is a simplified version that doesn't depend on local keystore
 */
export function getNamedTestKeypair(name: string): Ed25519Keypair {
  // Create deterministic seed based on name
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const seed = new Uint8Array(32);

  // Simple hash-like derivation for deterministic keypair
  for (let i = 0; i < nameBytes.length && i < 32; i++) {
    seed[i] = nameBytes[i] ?? 0;
  }

  return Ed25519Keypair.fromSecretKey(seed);
}
