/**
 * ZK Proof Type Definitions
 *
 * Types for private counter ZK proof generation and verification.
 */

import { type SnarkjsProof } from "@/utils/arkworks";

/**
 * Private counter state
 */
export interface PrivateCounterState {
  /** Current counter value (private) */
  value: bigint;
  /** Current value hash: Poseidon(value, salt) */
  valueHash: bigint;
  /** Salt value (private, fixed) */
  salt: bigint;
  /** Salt hash: Poseidon(salt) */
  saltHash: bigint;
}

/**
 * Parameters for ZK proof generation
 */
export interface ProofGenerationParams {
  /** Salt value (fixed for this counter) */
  salt: bigint;
  /** Current counter value */
  oldValue: bigint;
  /** Old randomness parameter (for circuit compatibility, same as salt) */
  oldRandomness: bigint;
  /** New randomness parameter (for circuit compatibility, same as salt) */
  newRandomness: bigint;
  /** Current value hash (on-chain): Poseidon(oldValue, salt) */
  oldHash: bigint;
  /** Salt hash (on-chain): Poseidon(salt) */
  saltHash: bigint;
}

/**
 * ZK Proof generation result
 */
export interface ProofResult {
  /** Groth16 proof (snarkjs format) */
  proof: SnarkjsProof;
  /** Public inputs */
  publicSignals: string[];
  /** New value hash: Poseidon(oldValue + 1, salt) */
  newHash: bigint;
  /** New value (oldValue + 1) */
  newValue: bigint;
  /** Proof bytes (Arkworks compressed format, 128 bytes) */
  proofBytes: Uint8Array;
  /** Public inputs bytes (96 bytes: 3 × 32-byte field elements) */
  publicInputsBytes: Uint8Array;
}

/**
 * Circuit input format
 */
export interface CircuitInputs {
  salt: string;
  old_value: string;
  old_randomness: string;
  new_randomness: string;
  salt_hash: string;
  old_hash: string;
  new_hash: string;
  [key: string]: string;
}

/**
 * Error types
 */
export class ProofGenerationError extends Error {
  override cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ProofGenerationError";
    this.cause = cause;
  }
}

export class PoseidonHashError extends Error {
  override cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "PoseidonHashError";
    this.cause = cause;
  }
}

export class CircuitLoadError extends Error {
  override cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "CircuitLoadError";
    this.cause = cause;
  }
}
