#!/usr/bin/env node
/**
 * Simple test using exact values from Move test
 */
import { buildPoseidon } from "circomlibjs";
import { groth16 } from "snarkjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WASM_PATH = path.join(__dirname, "../../public/circuits/private_counter.wasm");
const ZKEY_PATH = path.join(__dirname, "../../public/circuits/private_counter_final.zkey");

// Exact values from Move test (line 254-259)
const salt = 42n;
const oldValue = 0n;

// Expected hashes from Move test
const expectedSaltDigest = 12326503012965816391338144612242952408728683609716147019497703475006801258307n;
const expectedOldDigest = 9904646155488355737762297645225334693069781832889131634543122060982625196787n;
const expectedNewDigest = 14800396336478473958655799498724128728735427661463011194055900610499073368872n;

console.log("Testing with Move contract values...\n");

const poseidon = await buildPoseidon();
const F = poseidon.F;

// Compute hashes (using salt as randomness)
const saltDigest = BigInt(F.toString(poseidon([salt])));
const oldDigest = BigInt(F.toString(poseidon([oldValue, salt])));
const newValue = oldValue + 1n;
const newDigest = BigInt(F.toString(poseidon([newValue, salt])));

console.log("Computed hashes:");
console.log(`  salt_digest: ${saltDigest}`);
console.log(`  old_digest:  ${oldDigest}`);
console.log(`  new_digest:  ${newDigest}`);
console.log("");

console.log("Expected hashes (from Move test):");
console.log(`  salt_digest: ${expectedSaltDigest}`);
console.log(`  old_digest:  ${expectedOldDigest}`);
console.log(`  new_digest:  ${expectedNewDigest}`);
console.log("");

// Verify hashes match
if (saltDigest !== expectedSaltDigest) {
  console.error("❌ salt_digest mismatch!");
  process.exit(1);
}
if (oldDigest !== expectedOldDigest) {
  console.error("❌ old_digest mismatch!");
  process.exit(1);
}
if (newDigest !== expectedNewDigest) {
  console.error("❌ new_digest mismatch!");
  process.exit(1);
}

console.log("✅ All hashes match!\n");

// Generate proof
console.log("Generating proof...");
const circuitInputs = {
  salt: salt.toString(),
  old_value: oldValue.toString(),
  salt_hash: saltDigest.toString(),
  old_hash: oldDigest.toString(),
  new_hash: newDigest.toString(),
};

const startTime = Date.now();
const { proof, publicSignals } = await groth16.fullProve(
  circuitInputs,
  WASM_PATH,
  ZKEY_PATH,
);
const duration = Date.now() - startTime;

console.log(`✅ Proof generated in ${duration}ms\n`);

console.log("Public signals:");
console.log(`  [0] salt_hash: ${publicSignals[0]}`);
console.log(`  [1] old_hash:  ${publicSignals[1]}`);
console.log(`  [2] new_hash:  ${publicSignals[2]}`);
console.log("");

// Verify public signals match
if (publicSignals[0] !== saltDigest.toString()) {
  console.error("❌ Public signal[0] mismatch!");
  process.exit(1);
}
if (publicSignals[1] !== oldDigest.toString()) {
  console.error("❌ Public signal[1] mismatch!");
  process.exit(1);
}
if (publicSignals[2] !== newDigest.toString()) {
  console.error("❌ Public signal[2] mismatch!");
  process.exit(1);
}

console.log("✅ All public signals match expected values!");
console.log("\n✅ Test passed!");
