// Compute Poseidon hashes for Circom input
import { buildPoseidon } from "circomlibjs";
import consola from "consola";

async function main() {
  const poseidon = await buildPoseidon();

  // Input values
  const salt = BigInt(42);
  const oldValue = BigInt(0);
  const oldRandomness = BigInt(123456789);
  const newRandomness = BigInt(987654321);

  // Compute hashes
  const saltHash = poseidon.F.toString(poseidon([salt]));
  const oldHash = poseidon.F.toString(poseidon([oldValue, oldRandomness]));
  const newHash = poseidon.F.toString(poseidon([oldValue + BigInt(1), newRandomness]));

  consola.log("Computed Poseidon Hashes:");
  consola.log("salt_hash:", saltHash);
  consola.log("old_hash:", oldHash);
  consola.log("new_hash:", newHash);

  // Generate input.json
  const input = {
    salt: salt.toString(),
    old_value: oldValue.toString(),
    old_randomness: oldRandomness.toString(),
    new_randomness: newRandomness.toString(),
    salt_hash: saltHash,
    old_hash: oldHash,
    new_hash: newHash
  };

  consola.log("\ninput.json:");
  consola.log(JSON.stringify(input, null, 2));
}

main().catch(consola.error);
