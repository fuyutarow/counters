// Format Groth16 proof for Sui Move test
import { readFileSync } from 'fs';

// Read generated files
const proof = JSON.parse(readFileSync('proofs/proof.json', 'utf8'));
const publicSignals = JSON.parse(readFileSync('proofs/public.json', 'utf8'));
const vk = JSON.parse(readFileSync('keys/private_counter_vk.json', 'utf8'));

// Convert u256 to little-endian bytes (32 bytes)
function u256ToBytes(value) {
  const bn = BigInt(value);
  const bytes = [];
  let temp = bn;
  for (let i = 0; i < 32; i++) {
    bytes.push(Number(temp & 0xFFn));
    temp = temp >> 8n;
  }
  return bytes;
}

// Format proof points for Sui (pi_a, pi_b, pi_c)
function formatProofBytes() {
  const bytes = [];

  // pi_a: 2 coordinates * 32 bytes = 64 bytes
  bytes.push(...u256ToBytes(proof.pi_a[0]));
  bytes.push(...u256ToBytes(proof.pi_a[1]));

  // pi_b: 2 pairs * 2 coords * 32 bytes = 128 bytes
  bytes.push(...u256ToBytes(proof.pi_b[0][0]));
  bytes.push(...u256ToBytes(proof.pi_b[0][1]));
  bytes.push(...u256ToBytes(proof.pi_b[1][0]));
  bytes.push(...u256ToBytes(proof.pi_b[1][1]));

  // pi_c: 2 coordinates * 32 bytes = 64 bytes
  bytes.push(...u256ToBytes(proof.pi_c[0]));
  bytes.push(...u256ToBytes(proof.pi_c[1]));

  return bytes;
}

// Format public inputs for Sui (salt_hash || old_hash || new_hash)
function formatPublicInputsBytes() {
  const bytes = [];
  for (const input of publicSignals) {
    bytes.push(...u256ToBytes(input));
  }
  return bytes;
}

// Load Arkworks VK bytes
function formatVKBytes() {
  const arkworksVK = JSON.parse(readFileSync('keys/private_counter_vk_arkworks.json', 'utf8'));
  return arkworksVK.bytes;
}

const proofBytes = formatProofBytes();
const publicInputsBytes = formatPublicInputsBytes();
const vkBytes = formatVKBytes();

console.log("=== Sui Move Test Data ===\n");
console.log(`Proof bytes (${proofBytes.length} bytes):`);
console.log(JSON.stringify(proofBytes));
console.log();

console.log(`Public inputs bytes (${publicInputsBytes.length} bytes):`);
console.log(JSON.stringify(publicInputsBytes));
console.log();

console.log(`VK bytes (${vkBytes.length} bytes):`);
console.log(JSON.stringify(vkBytes));
console.log();

console.log("=== Move Code ===");
console.log(`
let mut proof = vector::empty<u8>();
let proof_data = vector[${proofBytes.join(', ')}];
let mut i = 0;
while (i < ${proofBytes.length}) {
    proof.push_back(proof_data[i]);
    i = i + 1;
};

let mut public_inputs = vector::empty<u8>();
let public_data = vector[${publicInputsBytes.join(', ')}];
i = 0;
while (i < ${publicInputsBytes.length}) {
    public_inputs.push_back(public_data[i]);
    i = i + 1;
};

let mut vk = vector::empty<u8>();
let vk_data = vector[${vkBytes.join(', ')}];
i = 0;
while (i < ${vkBytes.length}) {
    vk.push_back(vk_data[i]);
    i = i + 1;
};
`);

// Save formatted data
import { writeFileSync } from 'fs';
writeFileSync('proofs/sui_test_data.json', JSON.stringify({
  proof: proofBytes,
  publicInputs: publicInputsBytes,
  vk: vkBytes,
  publicSignals: {
    salt_hash: publicSignals[0],
    old_hash: publicSignals[1],
    new_hash: publicSignals[2]
  }
}, null, 2));

console.log("\n✅ Saved to proofs/sui_test_data.json");
