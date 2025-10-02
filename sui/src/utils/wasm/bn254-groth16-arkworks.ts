/**
 * BN254 Groth16 Arkworks Serializer (WASM)
 *
 * Converts BN254 Groth16 proofs from JSON format to Arkworks compressed binary format.
 * This serialization is required for Sui Move's groth16 module (fastcrypto-based).
 *
 * Input: Groth16 proof JSON (standard format, curve: bn128/BN254)
 * Output: Arkworks compressed binary (128 bytes for proof, 32 bytes/input for public inputs)
 */

import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { type SnarkjsProof } from "@/utils/arkworks";

/**
 * WASM module interface for BN254 Groth16 Arkworks serialization
 */
interface BN254Groth16ArkworksModule {
  default: (module_or_path?: WebAssembly.Module | BufferSource) => Promise<void>;
  convert_proof_to_arkworks: (proof_json: string) => Uint8Array;
  convert_public_inputs_to_bytes: (inputs_json: string) => Uint8Array;
}

let wasmModule: BN254Groth16ArkworksModule | null = null;
let initPromise: ResultAsync<void, Error> | null = null;

/**
 * Initialize WASM module (singleton)
 */
function initWasm(): ResultAsync<void, Error> {
  if (wasmModule) return okAsync(undefined);
  if (initPromise) return initPromise;

  initPromise = ResultAsync.fromPromise(
    (async () => {
      const wasmResponse = await fetch(
        "/wasm/bn254-groth16-arkworks-serializer/bn254_groth16_arkworks_serializer_bg.wasm",
      );
      if (!wasmResponse.ok) {
        throw new Error(`Failed to fetch WASM: ${wasmResponse.status}`);
      }
      const wasmBinary = await wasmResponse.arrayBuffer();
      const jsResponse = await fetch(
        "/wasm/bn254-groth16-arkworks-serializer/bn254_groth16_arkworks_serializer.js",
      );
      if (!jsResponse.ok) {
        throw new Error(`Failed to fetch JS module: ${jsResponse.status}`);
      }
      const jsCode = await jsResponse.text();
      const moduleBlob = new Blob([jsCode], { type: "application/javascript" });
      const moduleUrl = URL.createObjectURL(moduleBlob);
      const module = (await import(
        /* webpackIgnore: true */
        /* @vite-ignore */
        moduleUrl
      )) as BN254Groth16ArkworksModule;
      await module.default(wasmBinary);
      wasmModule = module;

      // Cleanup blob URL
      URL.revokeObjectURL(moduleUrl);
    })(),
    (error) => new Error(`WASM initialization failed: ${error}`),
  );

  return initPromise;
}

/**
 * Convert BN254 Groth16 proof (JSON) to Arkworks compressed format
 *
 * @param proof Groth16 proof object (standard JSON format, curve: bn128/BN254)
 * @returns Result<Uint8Array, Error> - Arkworks compressed proof (128 bytes, little-endian)
 */
export function convertBN254Groth16ProofToArkworks(
  proof: SnarkjsProof,
): ResultAsync<Uint8Array, Error> {
  return initWasm().andThen(() => {
    if (!wasmModule?.convert_proof_to_arkworks) {
      return errAsync(new Error("WASM module not properly initialized"));
    }

    const proofJson = JSON.stringify(proof);
    const bytes = wasmModule.convert_proof_to_arkworks(proofJson);

    // Validate output
    if (!(bytes instanceof Uint8Array)) {
      return errAsync(new Error("Invalid WASM output type"));
    }

    if (bytes.length !== 128) {
      return errAsync(new Error(`Invalid proof size: expected 128, got ${bytes.length}`));
    }

    return okAsync(bytes);
  });
}

/**
 * Convert BN254 public inputs to Arkworks format
 *
 * @param publicInputs Array of BN254 field element strings (decimal)
 * @returns Result<Uint8Array, Error> - Concatenated 32-byte little-endian field elements (BCS u256)
 */
export function convertBN254PublicInputsToArkworks(
  publicInputs: string[],
): ResultAsync<Uint8Array, Error> {
  return initWasm().andThen(() => {
    if (!wasmModule?.convert_public_inputs_to_bytes) {
      return errAsync(new Error("WASM module not properly initialized"));
    }

    const inputsJson = JSON.stringify(publicInputs);
    const bytes = wasmModule.convert_public_inputs_to_bytes(inputsJson);

    // Validate output
    if (!(bytes instanceof Uint8Array)) {
      return errAsync(new Error("Invalid WASM output type"));
    }

    const expectedSize = publicInputs.length * 32;
    if (bytes.length !== expectedSize) {
      return errAsync(new Error(`Invalid size: expected ${expectedSize}, got ${bytes.length}`));
    }

    return okAsync(bytes);
  });
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
export function preloadBN254Groth16ArkworksWasm(): ResultAsync<void, Error> {
  return initWasm();
}
