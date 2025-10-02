import { buildPoseidon } from "circomlibjs";

async function main() {
  const poseidon = await buildPoseidon();

  const salt = BigInt(42);
  const oldValue = BigInt(0);
  const newValue = BigInt(1);

  // Calculate hashes
  const _saltHash = poseidon.F.toString(poseidon([salt]));
  const _oldHash = poseidon.F.toString(poseidon([oldValue, salt]));
  const _newHash = poseidon.F.toString(poseidon([newValue, salt]));
}

main();
