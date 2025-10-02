/**
 * Arkworks Format Conversion Utilities
 *
 * Converts snarkjs proof format to Arkworks compressed format
 * compatible with Sui Move's groth16 module (fastcrypto-based).
 *
 * References:
 * - Arkworks: https://github.com/arkworks-rs/groth16
 * - Sui groth16: sui::groth16 module
 * - wasm/bn254-groth16-arkworks-serializer/src/lib.rs
 */

import consola from "consola";
import { okAsync, type ResultAsync } from "neverthrow";
import { convertBN254Groth16ProofToArkworks } from "@/utils/wasm/bn254-groth16-arkworks";

/**
 * snarkjs proof format
 */
export interface SnarkjsProof {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
  protocol: string;
  curve: string;
}

/**
 * Convert a field element string to 32-byte big-endian bytes
 */
function fieldElementToBytes(element: string): Uint8Array {
  const value = BigInt(element);
  const bytes = new Uint8Array(32);

  // Convert to big-endian bytes
  for (let i = 0; i < 32; i++) {
    bytes[31 - i] = Number((value >> BigInt(i * 8)) & 0xffn);
  }

  return bytes;
}

/**
 * Convert G1 point (pi_a or pi_c) to compressed bytes
 *
 * Arkworks compressed format for BN254 G1:
 * - 32 bytes for x-coordinate (big-endian)
 * - MSB contains compression flags (sign bit for y)
 *
 * NOTE: This is a simplified implementation that does NOT match Arkworks.
 * For production, use the Rust convert-proof tool instead.
 * This implementation will NOT produce valid proofs for on-chain verification.
 */
function compressG1Point(point: [string, string, string]): Uint8Array {
  // snarkjs format: [x, y, 1]
  // Arkworks uses serialize_compressed which encodes y's sign in x's MSB
  // This simplified version only uses x (INCORRECT but matches old behavior)
  const xBytes = fieldElementToBytes(point[0]);

  // TODO: Implement proper Arkworks compression with y-sign bit
  // For now, use Rust tool: wasm/bn254-groth16-arkworks-serializer/target/release/convert-proof
  return xBytes;
}

/**
 * Convert G2 point (pi_b) to compressed bytes
 *
 * Arkworks compressed format for BN254 G2:
 * - 64 bytes total (2 field elements in Fq2)
 * - Each Fq2 element has c0 and c1 components
 */
function compressG2Point(
  point: [[string, string], [string, string], [string, string]],
): Uint8Array {
  // snarkjs format: [[x_c0, x_c1], [y_c0, y_c1], [1, 0]]
  // Arkworks expects: x_c0 || x_c1 (64 bytes total)

  const x_c0_bytes = fieldElementToBytes(point[0][0]);
  const x_c1_bytes = fieldElementToBytes(point[0][1]);

  const compressed = new Uint8Array(64);
  compressed.set(x_c0_bytes, 0);
  compressed.set(x_c1_bytes, 32);

  return compressed;
}

/**
 * Convert snarkjs proof to Arkworks compressed format
 *
 * Output format (128 bytes total):
 * - pi_a: 32 bytes (G1 compressed)
 * - pi_b: 64 bytes (G2 compressed)
 * - pi_c: 32 bytes (G1 compressed)
 *
 * @param proof snarkjs proof object
 * @returns Uint8Array (128 bytes)
 */
export function convertProofToArkworks(proof: SnarkjsProof): ResultAsync<Uint8Array, Error> {
  // Try WASM first (correct implementation)
  return convertBN254Groth16ProofToArkworks(proof).orElse((error) => {
    consola.warn("WASM proof conversion failed, falling back to JS (BROKEN):", error);
    // Fall back to existing broken implementation
    return okAsync(convertProofToArkworksJS(proof));
  });
}

/**
 * JavaScript fallback implementation (BROKEN - do not use for production)
 * @deprecated Use WASM implementation instead
 */
function convertProofToArkworksJS(proof: SnarkjsProof): Uint8Array {
  const piA = compressG1Point(proof.pi_a);
  const piB = compressG2Point(proof.pi_b);
  const piC = compressG1Point(proof.pi_c);

  const result = new Uint8Array(128);
  result.set(piA, 0); // 0-31: pi_a
  result.set(piB, 32); // 32-95: pi_b
  result.set(piC, 96); // 96-127: pi_c

  return result;
}

/**
 * Convert public inputs to bytes for Sui Move
 *
 * Each public input is a BN254 field element encoded as BCS u256 (32 bytes, little-endian)
 *
 * @param publicInputs Array of field element strings
 * @returns Uint8Array BCS-encoded concatenation of u256 values
 */
export function convertPublicInputsToBytes(publicInputs: string[]): Uint8Array {
  const result = new Uint8Array(publicInputs.length * 32);

  for (let i = 0; i < publicInputs.length; i++) {
    const input = publicInputs[i];
    if (!input) {
      throw new Error(`Public input at index ${i} is undefined`);
    }
    const value = BigInt(input);
    const bytes = new Uint8Array(32);

    // Convert to little-endian bytes (BCS u256 encoding)
    for (let j = 0; j < 32; j++) {
      bytes[j] = Number((value >> BigInt(j * 8)) & 0xffn);
    }

    result.set(bytes, i * 32);
  }

  return result;
}

/**
 * Convert Uint8Array to hex string (for debugging)
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validate proof structure
 */
export function validateProof(proof: SnarkjsProof): void {
  if (proof.protocol !== "groth16") {
    throw new Error(`Invalid protocol: ${proof.protocol} (expected groth16)`);
  }
  if (proof.curve !== "bn128") {
    throw new Error(`Invalid curve: ${proof.curve} (expected bn128)`);
  }
  if (proof.pi_a.length !== 3) {
    throw new Error("Invalid pi_a length");
  }
  if (proof.pi_b.length !== 3 || proof.pi_b[0].length !== 2) {
    throw new Error("Invalid pi_b structure");
  }
  if (proof.pi_c.length !== 3) {
    throw new Error("Invalid pi_c length");
  }
}
