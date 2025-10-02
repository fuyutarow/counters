/**
 * Extract verification key from zkey file
 */

import { zKey } from "snarkjs";

async function main() {
  const zkeyPath = "./public/circuits/private_counter_final.zkey";
  const _vKey = await zKey.exportVerificationKey(zkeyPath);
}

main().catch((error) => {
  process.stderr.write(`Error: ${error}\n`);
  process.exit(1);
});
