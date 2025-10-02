/**
 * Proof Binary Comparison
 *
 * Move test と同じ入力で proof を生成し、binary レベルで比較
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPoseidon } from "circomlibjs";
import consola from "consola";
import { groth16 } from "snarkjs";
import { bytesToHex, convertProofToArkworks, type SnarkjsProof } from "../src/utils/arkworks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WASM_PATH = path.join(__dirname, "..", "public", "circuits", "private_counter.wasm");
const ZKEY_PATH = path.join(__dirname, "..", "public", "circuits", "private_counter_final.zkey");

// Move test の固定入力値（private_counter.move:254-259）
const MOVE_TEST_INPUTS = {
  salt: "42",
  old_value: "0",
  salt_hash: "12326503012965816391338144612242952408728683609716147019497703475006801258307", // Poseidon(42)
  old_hash: "9904646155488355737762297645225334693069781832889131634543122060982625196787", // Poseidon(0, 42)
  new_hash: "14800396336478473958655799498724128728735427661463011194055900610499073368872", // Poseidon(1, 42)
};

// Move test の proof（move/counter/sources/private_counter.move:269）
const MOVE_TEST_PROOF_HEX =
  "a402d1cc2f96510b188e7f6a2852b3df3bd46bea5c2a4ae828ce38b88c018da3d3e11349939dd83b40676cf99b75bfcf50239f558bd56f80e4f5651dcf40a92304de8f2c403f230060619074e1b3c10adda0688cc85873ff723e436e1d139d902fea57047e4ac01edc42e3d7b6a694be6296d2b9383665da08a02cf2d5f8d78d";

// Move test の public inputs（move/counter/sources/private_counter.move:277）
const _MOVE_TEST_PUBLIC_INPUTS_HEX =
  "4327c5b27e5de1dd5cbe8085f170fd65d03be5b19983387108dfedebaf8d401bf35aab96a7d06db4ba901f1a783dd5a0cb70417fe5c0abb2e7113867c0d4e5152863fd9cd89b78affa94ad5e8d8de6572d9c9a4f9fe14a7c7061203d3bbab820";

async function main() {
  const poseidon = await buildPoseidon();

  const salt = BigInt(MOVE_TEST_INPUTS.salt);
  const oldValue = BigInt(MOVE_TEST_INPUTS.old_value);

  const saltHash = poseidon([salt]);
  const _saltHashStr = poseidon.F.toString(saltHash);

  const oldHash = poseidon([oldValue, salt]);
  const _oldHashStr = poseidon.F.toString(oldHash);
  const start = Date.now();

  const { proof } = await groth16.fullProve(MOVE_TEST_INPUTS, WASM_PATH, ZKEY_PATH);

  const _elapsed = Date.now() - start;
  const nodeProofBytes = convertProofToArkworks(proof as SnarkjsProof);
  const nodeProofHex = bytesToHex(nodeProofBytes);

  const match = nodeProofHex === MOVE_TEST_PROOF_HEX;

  if (!match) {
    const nodeBytes = Buffer.from(nodeProofHex, "hex");
    const moveBytes = Buffer.from(MOVE_TEST_PROOF_HEX, "hex");

    for (let i = 0; i < 128; i++) {
      if (nodeBytes[i] !== moveBytes[i]) {
      }
    }
    process.exit(1);
  } else {
  }
}

main().catch(consola.error);
