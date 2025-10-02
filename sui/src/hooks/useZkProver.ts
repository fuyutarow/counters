/**
 * ZK Proof Generation Hook
 *
 * Generates ZK proofs for private counter increments using snarkjs.
 * Runs in the browser using WASM.
 */

import { useMutation } from "@tanstack/react-query";
import {
  type CircuitInputs,
  CircuitLoadError,
  PoseidonHashError,
  ProofGenerationError,
  type ProofGenerationParams,
  type ProofResult,
} from "@/lib/zkProof";
import {
  convertProofToArkworks,
  convertPublicInputsToBytes,
  type SnarkjsProof,
  validateProof,
} from "@/utils/arkworks";

/**
 * Compute Poseidon hash
 */
async function computePoseidonHash(inputs: bigint[]): Promise<bigint> {
  try {
    const { buildPoseidon } = await import("circomlibjs");
    const poseidon = await buildPoseidon();
    const hash = poseidon(inputs);
    const hashBigInt = BigInt(poseidon.F.toString(hash));
    return hashBigInt;
  } catch (error) {
    throw new PoseidonHashError("Failed to compute Poseidon hash", error);
  }
}

/**
 * Generate ZK proof for private counter increment
 */
async function generateProof(params: ProofGenerationParams): Promise<ProofResult> {
  try {
    // Step 1: Compute new value hash
    const newValue = params.oldValue + 1n;
    const newHash = await computePoseidonHash([newValue, params.newRandomness]);

    // Step 2: Prepare circuit inputs
    const circuitInputs: CircuitInputs = {
      salt: params.salt.toString(),
      old_value: params.oldValue.toString(),
      old_randomness: params.oldRandomness.toString(),
      new_randomness: params.newRandomness.toString(),
      salt_hash: params.saltHash.toString(),
      old_hash: params.oldHash.toString(),
      new_hash: newHash.toString(),
    };

    // Step 3: Load circuit files from public directory
    const wasmPath = "/circuits/private_counter.wasm";
    const zkeyPath = "/circuits/private_counter_final.zkey";

    let wasmFile: ArrayBuffer;
    let zkeyFile: ArrayBuffer;

    try {
      const [wasmResponse, zkeyResponse] = await Promise.all([fetch(wasmPath), fetch(zkeyPath)]);

      if (!wasmResponse.ok || !zkeyResponse.ok) {
        throw new Error(
          `Failed to load circuit files: WASM ${wasmResponse.status}, zkey ${zkeyResponse.status}`,
        );
      }

      [wasmFile, zkeyFile] = await Promise.all([
        wasmResponse.arrayBuffer(),
        zkeyResponse.arrayBuffer(),
      ]);
    } catch (error) {
      throw new CircuitLoadError("Failed to load circuit files", error);
    }

    // Step 4: Generate proof using snarkjs (dynamic import)
    const { groth16 } = await import("snarkjs");
    const { proof, publicSignals } = await groth16.fullProve(
      circuitInputs,
      new Uint8Array(wasmFile),
      new Uint8Array(zkeyFile),
    );

    // Step 5: Validate proof structure
    validateProof(proof as SnarkjsProof);

    // Step 6: Convert to Arkworks format
    const proofBytes = await convertProofToArkworks(proof as SnarkjsProof);
    const publicInputsBytes = convertPublicInputsToBytes(publicSignals);

    return {
      proof: proof as SnarkjsProof,
      publicSignals,
      newHash,
      newValue,
      proofBytes,
      publicInputsBytes,
    };
  } catch (error) {
    if (error instanceof PoseidonHashError || error instanceof CircuitLoadError) {
      throw error;
    }
    throw new ProofGenerationError("Failed to generate proof", error);
  }
}

/**
 * Hook for ZK proof generation
 *
 * Usage:
 * ```tsx
 * const { mutateAsync: generateProof, isPending } = useZkProver();
 *
 * const result = await generateProof({
 *   salt: 12345n,
 *   oldValue: 0n,
 *   oldRandomness: 987654321n,
 *   newRandomness: 123456789n,
 *   oldHash: ...,
 *   saltHash: ...,
 * });
 * ```
 */
export function useZkProver() {
  return useMutation({
    mutationKey: ["zkProver", "generateProof"],
    mutationFn: generateProof,
  });
}
