/**
 * BN254 Groth16 Arkworks Serializer (WASM)
 *
 * Converts BN254 Groth16 proofs from JSON format to Arkworks compressed binary format.
 * This serialization is required for Sui Move's groth16 module (fastcrypto-based).
 *
 * Input: Groth16 proof JSON (standard format, curve: bn128/BN254)
 * Output: Arkworks compressed binary (128 bytes for proof, 32 bytes/input for public inputs)
 */

import { type SnarkjsProof } from "@/utils/arkworks";

/**
 * WASM module interface for BN254 Groth16 Arkworks serialization
 */
interface BN254Groth16ArkworksModule {
  default: () => Promise<void>;
  convert_proof_to_arkworks: (proof_json: string) => Uint8Array;
  convert_public_inputs_to_bytes: (inputs_json: string) => Uint8Array;
}

let wasmModule: BN254Groth16ArkworksModule | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize WASM module (singleton)
 */
async function initWasm(): Promise<void> {
  if (wasmModule) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Dynamic import for Next.js compatibility
      // Note: Module path will be valid after WASM build
      const module = (await import(
        /* webpackChunkName: "bn254-groth16-arkworks" */
        /* @ts-expect-error WASM module generated at build time */
        "/wasm/bn254-groth16-arkworks-serializer/bn254_groth16_arkworks_serializer"
      )) as BN254Groth16ArkworksModule;

      // Initialize WASM
      await module.default();
      wasmModule = module;
    } catch (_error) {
      throw new Error("WASM initialization failed");
    }
  })();

  return initPromise;
}

/**
 * Convert BN254 Groth16 proof (JSON) to Arkworks compressed format
 *
 * @param proof Groth16 proof object (standard JSON format, curve: bn128/BN254)
 * @returns Uint8Array (128 bytes) - Arkworks compressed proof (little-endian)
 */
export async function convertBN254Groth16ProofToArkworks(proof: SnarkjsProof): Promise<Uint8Array> {
  await initWasm();

  if (!wasmModule?.convert_proof_to_arkworks) {
    throw new Error("WASM module not properly initialized");
  }
  const proofJson = JSON.stringify(proof);
  const bytes = wasmModule.convert_proof_to_arkworks(proofJson);

  // Validate output
  if (!(bytes instanceof Uint8Array)) {
    throw new Error("Invalid WASM output type");
  }

  if (bytes.length !== 128) {
    throw new Error(`Invalid proof size: expected 128, got ${bytes.length}`);
  }

  return bytes;
}

/**
 * Convert BN254 public inputs to Arkworks format
 *
 * @param publicInputs Array of BN254 field element strings (decimal)
 * @returns Uint8Array - Concatenated 32-byte little-endian field elements (BCS u256)
 */
export async function convertBN254PublicInputsToArkworks(
  publicInputs: string[],
): Promise<Uint8Array> {
  await initWasm();

  if (!wasmModule?.convert_public_inputs_to_bytes) {
    throw new Error("WASM module not properly initialized");
  }
  const inputsJson = JSON.stringify(publicInputs);
  const bytes = wasmModule.convert_public_inputs_to_bytes(inputsJson);

  // Validate output
  if (!(bytes instanceof Uint8Array)) {
    throw new Error("Invalid WASM output type");
  }

  const expectedSize = publicInputs.length * 32;
  if (bytes.length !== expectedSize) {
    throw new Error(`Invalid size: expected ${expectedSize}, got ${bytes.length}`);
  }

  return bytes;
}

/**
 * Check if BN254 Groth16 Arkworks WASM is available and initialized
 */
export function isBN254Groth16ArkworksWasmAvailable(): boolean {
  return wasmModule !== null;
}

/**
 * Preload BN254 Groth16 Arkworks WASM module (optional, for performance)
 */
export function preloadBN254Groth16ArkworksWasm(): Promise<void> {
  return initWasm();
}
