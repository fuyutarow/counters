import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

console.log("Current directory:", __dirname);

const wasmPath = join(__dirname, "../../public/circuits/private_counter.wasm");
const zkeyPath = join(__dirname, "../../circuits/keys/private_counter_final.zkey");
const vkeyPath = join(__dirname, "../../circuits/keys/private_counter_vk.json");

console.log("\nChecking files:");
console.log("WASM path:", resolve(wasmPath));
console.log("WASM exists:", existsSync(wasmPath));
if (existsSync(wasmPath)) {
  const stats = statSync(wasmPath);
  console.log("WASM size:", (stats.size / 1024 / 1024).toFixed(2), "MB");
}

console.log("\nzkey path:", resolve(zkeyPath));
console.log("zkey exists:", existsSync(zkeyPath));
if (existsSync(zkeyPath)) {
  const stats = statSync(zkeyPath);
  console.log("zkey size:", (stats.size / 1024 / 1024).toFixed(2), "MB");
}

console.log("\nvkey path:", resolve(vkeyPath));
console.log("vkey exists:", existsSync(vkeyPath));
if (existsSync(vkeyPath)) {
  const stats = statSync(vkeyPath);
  console.log("vkey size:", (stats.size / 1024).toFixed(2), "KB");
}

console.log("\nTrying to load snarkjs and circomlibjs...");
try {
  const { groth16 } = await import("snarkjs");
  const { buildPoseidon } = await import("circomlibjs");
  console.log("Libraries loaded successfully");

  console.log("\nComputing Poseidon hashes...");
  const salt = 12345n;
  const oldValue = 0n;
  const oldRandomness = 987654321n;
  const newRandomness = 123456789n;

  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  console.log("F methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(F)));

  // Try different conversion methods
  const saltHashRaw = poseidon([salt]);
  console.log("Raw hash type:", typeof saltHashRaw);
  console.log("Raw hash:", saltHashRaw);

  const saltHash = F.toString(saltHashRaw);
  const oldHash = F.toString(poseidon([oldValue, oldRandomness]));
  const newValue = oldValue + 1n;
  const newHash = F.toString(poseidon([newValue, newRandomness]));

  console.log("salt_hash:", saltHash);
  console.log("old_hash:", oldHash);
  console.log("new_hash:", newHash);

  console.log("\nTrying to generate proof with correct inputs...");
  const inputs = {
    salt: salt.toString(),
    old_value: oldValue.toString(),
    old_randomness: oldRandomness.toString(),
    new_randomness: newRandomness.toString(),
    salt_hash: saltHash,
    old_hash: oldHash,
    new_hash: newHash
  };

  console.log("Calling groth16.fullProve...");
  const startTime = Date.now();
  const result = await groth16.fullProve(inputs, wasmPath, zkeyPath);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n✅ Proof generated successfully in ${duration}s`);
  console.log("Public signals:", result.publicSignals);

  console.log("\nVerifying proof...");
  const { readFileSync } = await import("node:fs");
  const vkey = JSON.parse(readFileSync(vkeyPath, "utf-8"));
  const isValid = await groth16.verify(vkey, result.publicSignals, result.proof);
  console.log("Proof valid:", isValid);

  if (!isValid) {
    console.error("❌ Proof verification failed!");
    process.exit(1);
  }

  console.log("\n✅ Complete test passed!");
  process.exit(0);
} catch (error) {
  console.error("\n❌ Error:", error.message);
  console.error(error.stack);
  process.exit(1);
}
