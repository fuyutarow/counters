/**
 * Pedersen Commitment utilities for BLS12-381 G1 curve
 *
 * Commitment: C = value * G + blinding * H
 * where G and H are generators on the BLS12-381 G1 curve
 *
 * This module provides utilities for:
 * - Generating commitments to values with random blinding factors
 * - Homomorphic addition of commitments
 * - Serialization to/from 48-byte compressed format
 */

import { bls12_381 } from "@noble/curves/bls12-381.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { Result } from "neverthrow";

// Use the G1 point class directly from bls12_381
const G1Point = bls12_381.G1.Point;

// Generator G (BLS12-381 G1 base point)
const G = G1Point.BASE;

// Generator H (derived from G using hash-to-curve for independence)
// In production, this should be a standardized nothing-up-my-sleeve point
// For demo purposes, we use a simple derivation with a small scalar
// The scalar must be within the field order (Fr)
const H = G.multiply(BigInt("12345678901234567890"));

export interface PedersenCommitment {
  /** The commitment point C = value * G + blinding * H */
  point: typeof G1Point.ZERO;
  /** The committed value */
  value: bigint;
  /** The blinding factor (secret) */
  blinding: bigint;
}

/**
 * Create a Pedersen commitment to a value
 * @param value - The value to commit to (will be used as scalar)
 * @param blinding - Optional blinding factor (random if not provided)
 * @returns PedersenCommitment object containing point, value, and blinding
 */
export function createCommitment(value: bigint, blinding?: bigint): PedersenCommitment {
  const r = blinding ?? generateBlindingFactor();

  // Ensure values are within the field order
  const frOrder = bls12_381.fields.Fr.ORDER;
  const normalizedValue = value % frOrder;
  const normalizedBlinding = r % frOrder;

  // C = value * G + r * H
  // Handle zero case: multiply() doesn't accept 0, so use ZERO point
  const valuePoint = normalizedValue === 0n ? G1Point.ZERO : G.multiply(normalizedValue);
  const blindingPoint = normalizedBlinding === 0n ? G1Point.ZERO : H.multiply(normalizedBlinding);
  const point = valuePoint.add(blindingPoint);

  return {
    point,
    value: normalizedValue,
    blinding: normalizedBlinding,
  };
}

/**
 * Generate a random blinding factor
 * @returns Random 32-byte scalar as bigint
 */
export function generateBlindingFactor(): bigint {
  const bytes = randomBytes(32);
  return BigInt(`0x${Buffer.from(bytes).toString("hex")}`) % bls12_381.fields.Fr.ORDER;
}

/**
 * Add two commitments homomorphically
 * C_result = C1 + C2 = (v1 + v2) * G + (r1 + r2) * H
 *
 * @param c1 - First commitment
 * @param c2 - Second commitment
 * @returns New commitment representing the sum
 */
export function addCommitments(c1: PedersenCommitment, c2: PedersenCommitment): PedersenCommitment {
  return {
    point: c1.point.add(c2.point),
    value: c1.value + c2.value,
    blinding: c1.blinding + c2.blinding,
  };
}

/**
 * Serialize a commitment point to 48-byte compressed format (for Sui)
 * @param commitment - The commitment to serialize
 * @returns Uint8Array of 48 bytes (compressed G1 point)
 */
export function serializeCommitment(commitment: PedersenCommitment): Uint8Array {
  return commitment.point.toBytes(true); // true = compressed format (48 bytes)
}

/**
 * Deserialize a commitment point from 48-byte compressed format
 * @param bytes - 48-byte compressed G1 point
 * @returns G1 Point
 */
export function deserializePoint(bytes: Uint8Array): typeof G1Point.ZERO {
  if (bytes.length !== 48) {
    throw new Error(`Invalid commitment bytes length: expected 48, got ${bytes.length}`);
  }
  return G1Point.fromBytes(bytes);
}

/**
 * Convert Uint8Array to number array for Sui transaction arguments
 * @param bytes - Uint8Array to convert
 * @returns Array of numbers
 */
export function toNumberArray(bytes: Uint8Array): number[] {
  return Array.from(bytes);
}

/**
 * Helper: Create a commitment and return serialized bytes as number array
 * This is the format expected by Sui Move functions
 *
 * @param value - The value to commit to
 * @param blinding - Optional blinding factor
 * @returns Object containing commitment and serialized bytes as number array
 */
export function createSerializedCommitment(value: bigint, blinding?: bigint) {
  const commitment = createCommitment(value, blinding);
  const bytes = serializeCommitment(commitment);
  const numberArray = toNumberArray(bytes);

  return {
    commitment,
    bytes: numberArray,
  };
}

/**
 * Verify that a commitment is valid (point is on curve and not identity)
 * @param commitment - The commitment to verify
 * @returns true if valid
 */
export function verifyCommitment(commitment: PedersenCommitment): boolean {
  // Check if point is on curve using neverthrow
  const validityResult = Result.fromThrowable(
    () => commitment.point.assertValidity(),
    () => new Error("Point is not on curve"),
  )();

  if (validityResult.isErr()) {
    return false;
  }

  // Check if point is not the identity element
  if (commitment.point.equals(G1Point.ZERO)) {
    return false;
  }

  return true;
}
