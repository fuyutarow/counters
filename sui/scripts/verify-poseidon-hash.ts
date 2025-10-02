/**
 * Verify Poseidon hash calculations for debugging
 */

import { buildPoseidon } from "circomlibjs";

async function main() {
  const poseidon = await buildPoseidon();

  // From localStorage (debug log)
  const salt = BigInt(
    "4434101184528288189458157856541229510627346515133926199788870115563953566920",
  );
  const value = BigInt(0);
  const _expectedSaltHash = BigInt(
    "15655071725458443582518531291559511868640755770234318335095046814094373139733",
  );
  const _expectedValueHash = BigInt(
    "16238578798767626458178208429831401277392050224440389586858449059889417028129",
  );

  // Calculate salt_hash = Poseidon(salt)
  const saltHash = poseidon([salt]);
  const _saltHashBigInt = BigInt(poseidon.F.toString(saltHash));

  // Calculate value_hash = Poseidon(value, salt)
  const valueHash = poseidon([value, salt]);
  const _valueHashBigInt = BigInt(poseidon.F.toString(valueHash));

  // Calculate new value hash (value + 1)
  const newValue = value + 1n;
  const newValueHash = poseidon([newValue, salt]);
  const _newValueHashBigInt = BigInt(poseidon.F.toString(newValueHash));
}

main().catch((error) => {
  process.stderr.write(`Error: ${error}\n`);
  process.exit(1);
});
