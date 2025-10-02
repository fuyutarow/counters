/**
 * Arkworks WASM Converter
 *
 * Singleton wrapper for the Arkworks proof converter WASM module.
 * Ensures one-time initialization and provides TypeScript-friendly API.
 */

import { type SnarkjsProof } from "@/utils/arkworks";

let wasmModule: any = null;
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
      const module = await import(
        /* webpackChunkName: "arkworks-wasm" */
        "/wasm/arkworks-converter/arkworks-converter.js"
      );

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
 * Convert snarkjs proof to Arkworks compressed format
 *
 * @param proof snarkjs proof object
 * @returns Uint8Array (128 bytes) - Arkworks compressed proof
 */
export async function convertProofToArkworksWASM(proof: SnarkjsProof): Promise<Uint8Array> {
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
 * Convert public inputs to Arkworks format
 *
 * @param publicInputs Array of field element strings
 * @returns Uint8Array - Concatenated little-endian field elements
 */
export async function convertPublicInputsToArkworksWASM(
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
 * Check if WASM is available and initialized
 */
export function isWasmAvailable(): boolean {
  return wasmModule !== null;
}

/**
 * Preload WASM module (optional, for performance)
 */
export function preloadWasm(): Promise<void> {
  return initWasm();
}
