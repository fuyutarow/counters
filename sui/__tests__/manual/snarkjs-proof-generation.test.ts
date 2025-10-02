import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPoseidon } from "circomlibjs";
import { groth16 } from "snarkjs";

describe("ZK Proof Generation with snarkjs", () => {
  test(
    "should generate and verify a proof for private_counter circuit",
    async () => {
      const _startTime = Date.now();
      const salt = 12345n;
      const oldValue = 0n;
      const oldRandomness = 987654321n;
      const newRandomness = 123456789n;
      const poseidonHash = await buildPoseidon();
      const F = poseidonHash.F;

      const saltHash = F.toString(poseidonHash([salt]));
      const oldHash = F.toString(poseidonHash([oldValue, oldRandomness]));
      const newValue = oldValue + 1n;
      const newHash = F.toString(poseidonHash([newValue, newRandomness]));
      const inputs = {
        salt: salt.toString(),
        old_value: oldValue.toString(),
        old_randomness: oldRandomness.toString(),
        new_randomness: newRandomness.toString(),
        salt_hash: saltHash,
        old_hash: oldHash,
        new_hash: newHash,
      };
      const wasmPath = join(__dirname, "../../public/circuits/private_counter.wasm");
      const zkeyPath = join(__dirname, "../../circuits/keys/private_counter_final.zkey");
      const _proveStart = Date.now();
      const { proof, publicSignals } = await groth16.fullProve(inputs, wasmPath, zkeyPath);
      const vkeyPath = join(__dirname, "../../circuits/keys/private_counter_vk.json");
      const vkey = JSON.parse(readFileSync(vkeyPath, "utf-8"));

      const _verifyStart = Date.now();
      const isValid = await groth16.verify(vkey, publicSignals, proof);
      expect(isValid).toBe(true);
      expect(publicSignals).toHaveLength(3);
      expect(publicSignals[0]).toBe(saltHash);
      expect(publicSignals[1]).toBe(oldHash);
      expect(publicSignals[2]).toBe(newHash);
    },
    { timeout: 60000 },
  ); // 60 seconds timeout for proof generation
});
