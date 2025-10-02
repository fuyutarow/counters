/**
 * @fuyutarow/fastcrypto-zkp WASM Wrapper
 *
 * Browser-compatible BN254 Groth16 proof verification matching Sui's fastcrypto-zkp.
 *
 * References:
 * - https://github.com/MystenLabs/fastcrypto/tree/main/fastcrypto-zkp
 * - https://github.com/MystenLabs/fastcrypto/blob/main/fastcrypto-zkp/src/bn254/verifier.rs#L69
 */

/**
 * WASM module interface for fastcrypto-zkp
 */
interface FastcryptoZkpModule {
  default: () => Promise<void>;
  verify_groth16_proof: (
    vk_bytes: Uint8Array,
    public_inputs_json: string,
    proof_bytes: Uint8Array,
  ) => boolean;
  convert_vk_to_arkworks: (vk_json: string) => Uint8Array;
}

let wasmModule: FastcryptoZkpModule | null = null;
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
      const module = (await import(
        /* webpackChunkName: "fastcrypto-zkp" */
        /* @ts-expect-error WASM module generated at build time */
        "/wasm/fastcrypto-zkp/fastcrypto_zkp_wasm"
      )) as FastcryptoZkpModule;

      // Initialize WASM
      await module.default();
      wasmModule = module;
    } catch (error) {
      console.error("WASM initialization failed:", error);
      throw new Error("Failed to initialize fastcrypto-zkp WASM module");
    }
  })();

  return initPromise;
}

/**
 * Verify a BN254 Groth16 proof
 *
 * This function matches the exact behavior of Sui's fastcrypto-zkp verifier:
 * https://github.com/MystenLabs/fastcrypto/blob/85a38ec5113b8e248f556ec3a095a5a2f5be145a/fastcrypto-zkp/src/bn254/verifier.rs#L69
 *
 * @param vkBytes - Verifying key in Arkworks compressed format
 * @param publicInputs - Array of public inputs as decimal strings
 * @param proofBytes - Proof in Arkworks compressed format (128 bytes)
 * @returns true if proof is valid, false otherwise
 * @throws Error if verification fails due to invalid inputs
 */
export async function verifyGroth16Proof(
  vkBytes: Uint8Array,
  publicInputs: string[],
  proofBytes: Uint8Array,
): Promise<boolean> {
  await initWasm();

  if (!wasmModule?.verify_groth16_proof) {
    throw new Error("WASM module not properly initialized");
  }

  // Validate inputs
  if (!(vkBytes instanceof Uint8Array)) {
    throw new Error("vkBytes must be Uint8Array");
  }
  if (!(proofBytes instanceof Uint8Array)) {
    throw new Error("proofBytes must be Uint8Array");
  }
  if (proofBytes.length !== 128) {
    throw new Error(`Invalid proof size: expected 128 bytes, got ${proofBytes.length}`);
  }

  const publicInputsJson = JSON.stringify(publicInputs);

  try {
    return wasmModule.verify_groth16_proof(vkBytes, publicInputsJson, proofBytes);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Proof verification failed: ${errorMsg}`);
  }
}

/**
 * Convert verifying key from JSON format to Arkworks compressed bytes
 *
 * @param vkJson - Verifying key in JSON format (snarkjs compatible)
 * @returns Verifying key in Arkworks compressed format
 */
export async function convertVkToArkworks(vkJson: string): Promise<Uint8Array> {
  await initWasm();

  if (!wasmModule?.convert_vk_to_arkworks) {
    throw new Error("WASM module not properly initialized");
  }

  return wasmModule.convert_vk_to_arkworks(vkJson);
}

/**
 * Check if fastcrypto-zkp WASM is available and initialized
 */
export function isFastcryptoZkpWasmAvailable(): boolean {
  return wasmModule !== null;
}

/**
 * Preload fastcrypto-zkp WASM module (optional, for performance)
 */
export function preloadFastcryptoZkpWasm(): Promise<void> {
  return initWasm();
}
