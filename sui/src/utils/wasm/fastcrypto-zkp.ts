/**
 * @fuyutarow/fastcrypto-zkp WASM Wrapper
 *
 * Browser-compatible BN254 Groth16 proof verification matching Sui's fastcrypto-zkp.
 *
 * References:
 * - https://github.com/MystenLabs/fastcrypto/tree/main/fastcrypto-zkp
 * - https://github.com/MystenLabs/fastcrypto/blob/main/fastcrypto-zkp/src/bn254/verifier.rs#L69
 */

import { errAsync, okAsync, ResultAsync } from "neverthrow";

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
let initPromise: ResultAsync<void, Error> | null = null;

/**
 * Initialize WASM module (singleton)
 */
function initWasm(): ResultAsync<void, Error> {
  if (wasmModule) return okAsync(undefined);
  if (initPromise) return initPromise;

  initPromise = ResultAsync.fromPromise(
    (async () => {
      // Dynamic import for Next.js compatibility
      const module = (await import(
        /* webpackChunkName: "fastcrypto-zkp" */
        /* @ts-expect-error WASM module generated at build time */
        "/wasm/fastcrypto-zkp/fastcrypto_zkp_wasm"
      )) as FastcryptoZkpModule;

      // Initialize WASM
      await module.default();
      wasmModule = module;
    })(),
    (error) => new Error(`Failed to initialize fastcrypto-zkp WASM module: ${error}`),
  );

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
 * @returns Result<boolean, Error> - Ok(true) if proof is valid, Err if verification fails
 */
export function verifyGroth16Proof(
  vkBytes: Uint8Array,
  publicInputs: string[],
  proofBytes: Uint8Array,
): ResultAsync<boolean, Error> {
  return initWasm().andThen(() => {
    if (!wasmModule?.verify_groth16_proof) {
      return errAsync(new Error("WASM module not properly initialized"));
    }

    // Validate inputs
    if (!(vkBytes instanceof Uint8Array)) {
      return errAsync(new Error("vkBytes must be Uint8Array"));
    }
    if (!(proofBytes instanceof Uint8Array)) {
      return errAsync(new Error("proofBytes must be Uint8Array"));
    }
    if (proofBytes.length !== 128) {
      return errAsync(
        new Error(`Invalid proof size: expected 128 bytes, got ${proofBytes.length}`),
      );
    }

    const publicInputsJson = JSON.stringify(publicInputs);

    return ResultAsync.fromPromise(
      Promise.resolve(wasmModule.verify_groth16_proof(vkBytes, publicInputsJson, proofBytes)),
      (error) => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return new Error(`Proof verification failed: ${errorMsg}`);
      },
    );
  });
}

/**
 * Convert verifying key from JSON format to Arkworks compressed bytes
 *
 * @param vkJson - Verifying key in JSON format (snarkjs compatible)
 * @returns Result<Uint8Array, Error> - Verifying key in Arkworks compressed format
 */
export function convertVkToArkworks(vkJson: string): ResultAsync<Uint8Array, Error> {
  return initWasm().andThen(() => {
    if (!wasmModule?.convert_vk_to_arkworks) {
      return errAsync(new Error("WASM module not properly initialized"));
    }

    return ResultAsync.fromPromise(
      Promise.resolve(wasmModule.convert_vk_to_arkworks(vkJson)),
      (error) => new Error(`VK conversion failed: ${error}`),
    );
  });
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
export function preloadFastcryptoZkpWasm(): ResultAsync<void, Error> {
  return initWasm();
}
