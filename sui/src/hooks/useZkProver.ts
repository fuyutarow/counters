/**
 * ZK Proof Generation Hook
 *
 * Generates ZK proofs for private counter increments using snarkjs.
 * Runs in the browser using WASM.
 */

import { useMutation } from "@tanstack/react-query";
import { ResultAsync } from "neverthrow";
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
function computePoseidonHash(inputs: bigint[]): ResultAsync<bigint, PoseidonHashError> {
  return ResultAsync.fromPromise(
    (async () => {
      const { buildPoseidon } = await import("circomlibjs");
      const poseidon = await buildPoseidon();
      const hash = poseidon(inputs);
      const hashBigInt = BigInt(poseidon.F.toString(hash));
      return hashBigInt;
    })(),
    (error) => new PoseidonHashError("Failed to compute Poseidon hash", error),
  );
}

/**
 * Load circuit files from public directory
 */
function loadCircuitFiles(): ResultAsync<
  { wasmFile: ArrayBuffer; zkeyFile: ArrayBuffer },
  CircuitLoadError
> {
  const wasmPath = "/circuits/private_counter.wasm";
  const zkeyPath = "/circuits/private_counter_final.zkey";

  return ResultAsync.fromPromise(
    (async () => {
      const [wasmResponse, zkeyResponse] = await Promise.all([fetch(wasmPath), fetch(zkeyPath)]);

      if (!wasmResponse.ok || !zkeyResponse.ok) {
        throw new Error(
          `Failed to load circuit files: WASM ${wasmResponse.status}, zkey ${zkeyResponse.status}`,
        );
      }

      const [wasmFile, zkeyFile] = await Promise.all([
        wasmResponse.arrayBuffer(),
        zkeyResponse.arrayBuffer(),
      ]);

      return { wasmFile, zkeyFile };
    })(),
    (error) => new CircuitLoadError("Failed to load circuit files", error),
  );
}

/**
 * Generate ZK proof for private counter increment
 */
function generateProof(
  params: ProofGenerationParams,
): ResultAsync<ProofResult, PoseidonHashError | CircuitLoadError | ProofGenerationError> {
  // Step 1: Compute new value hash
  const newValue = params.oldValue + 1n;

  return computePoseidonHash([newValue, params.newRandomness])
    .andThen((newHash) => {
      // Step 2: Prepare circuit inputs
      const circuitInputs: CircuitInputs = {
        salt: params.salt.toString(),
        old_value: params.oldValue.toString(),
        salt_hash: params.saltHash.toString(),
        old_hash: params.oldHash.toString(),
        new_hash: newHash.toString(),
      };

      // Step 3: Load circuit files
      return loadCircuitFiles().andThen(({ wasmFile, zkeyFile }) => {
        // Step 4: Generate proof using snarkjs
        return ResultAsync.fromPromise(
          (async () => {
            const { groth16 } = await import("snarkjs");
            const { proof, publicSignals } = await groth16.fullProve(
              circuitInputs,
              new Uint8Array(wasmFile),
              new Uint8Array(zkeyFile),
            );

            // Step 5: Validate proof structure
            validateProof(proof as SnarkjsProof);

            return { proof: proof as SnarkjsProof, publicSignals, newHash, newValue };
          })(),
          (error) => new ProofGenerationError("Failed to generate proof", error),
        );
      });
    })
    .andThen(({ proof, publicSignals, newHash, newValue }) => {
      // Step 6: Convert to Arkworks format
      return convertProofToArkworks(proof).map((proofBytes) => {
        const publicInputsBytes = convertPublicInputsToBytes(publicSignals);

        return {
          proof,
          publicSignals,
          newHash,
          newValue,
          proofBytes,
          publicInputsBytes,
        };
      });
    });
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
    mutationFn: (params: ProofGenerationParams) =>
      generateProof(params).match(
        (result) => result,
        (error) => {
          throw error;
        },
      ),
  });
}
