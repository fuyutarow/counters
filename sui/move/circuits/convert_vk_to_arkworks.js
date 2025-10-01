// Convert snarkjs verification key to Arkworks canonical compressed format
import { readFileSync, writeFileSync } from 'fs';

const vk = JSON.parse(readFileSync('keys/private_counter_vk.json', 'utf8'));

// Helper: Convert field element to 32-byte little-endian
function fieldToBytes(value) {
  const bn = BigInt(value);
  const bytes = [];
  let temp = bn;
  for (let i = 0; i < 32; i++) {
    bytes.push(Number(temp & 0xFFn));
    temp = temp >> 8n;
  }
  return bytes;
}

// Helper: Convert G1 point to compressed bytes (32 bytes for BN254)
function g1ToBytes(point) {
  // For BN254 G1 point in affine coordinates [x, y, z]
  // Arkworks compressed format: x-coordinate (32 bytes) + compression flag
  const x = BigInt(point[0]);
  const y = BigInt(point[1]);

  // Compressed format: just x-coordinate with a flag bit
  // For simplicity, we'll use uncompressed format (64 bytes: x + y)
  return [...fieldToBytes(x), ...fieldToBytes(y)];
}

// Helper: Convert G2 point to compressed bytes (64 bytes for BN254)
function g2ToBytes(point) {
  // G2 point is [[x0, x1], [y0, y1], [z0, z1]]
  // Compressed: x0, x1 (2 * 32 bytes) with flag
  // For simplicity, use uncompressed: x0, x1, y0, y1 (128 bytes)
  const x0 = BigInt(point[0][0]);
  const x1 = BigInt(point[0][1]);
  const y0 = BigInt(point[1][0]);
  const y1 = BigInt(point[1][1]);

  return [
    ...fieldToBytes(x0),
    ...fieldToBytes(x1),
    ...fieldToBytes(y0),
    ...fieldToBytes(y1)
  ];
}

// Arkworks VerifyingKey serialization format:
// - alpha_g1: G1 point (64 bytes uncompressed)
// - beta_g2: G2 point (128 bytes uncompressed)
// - gamma_g2: G2 point (128 bytes uncompressed)
// - delta_g2: G2 point (128 bytes uncompressed)
// - gamma_abc_g1: Vec<G1> points (4 points for 3 public inputs)

const bytes = [];

// Serialize alpha_g1
bytes.push(...g1ToBytes(vk.vk_alpha_1));

// Serialize beta_g2
bytes.push(...g2ToBytes(vk.vk_beta_2));

// Serialize gamma_g2
bytes.push(...g2ToBytes(vk.vk_gamma_2));

// Serialize delta_g2
bytes.push(...g2ToBytes(vk.vk_delta_2));

// Serialize gamma_abc_g1 length (u64 little-endian)
const numIC = vk.IC.length;
const lenBytes = [];
let len = numIC;
for (let i = 0; i < 8; i++) {
  lenBytes.push(len & 0xFF);
  len = len >> 8;
}
bytes.push(...lenBytes);

// Serialize each IC point
for (const ic of vk.IC) {
  bytes.push(...g1ToBytes(ic));
}

console.log(`Generated Arkworks VK bytes: ${bytes.length} bytes`);
console.log(`Expected structure:`);
console.log(`  - alpha_g1: 64 bytes`);
console.log(`  - beta_g2: 128 bytes`);
console.log(`  - gamma_g2: 128 bytes`);
console.log(`  - delta_g2: 128 bytes`);
console.log(`  - IC length: 8 bytes (${numIC} points)`);
console.log(`  - IC points: ${numIC * 64} bytes (${numIC} × 64)`);
console.log(`  - Total: ${64 + 128 + 128 + 128 + 8 + numIC * 64} bytes`);

// Save binary format
const buffer = Buffer.from(bytes);
writeFileSync('keys/private_counter_vk_arkworks.bin', buffer);

// Also save as JSON for reference
writeFileSync('keys/private_counter_vk_arkworks.json', JSON.stringify({
  bytes,
  length: bytes.length,
  structure: {
    alpha_g1_bytes: 64,
    beta_g2_bytes: 128,
    gamma_g2_bytes: 128,
    delta_g2_bytes: 128,
    ic_length_bytes: 8,
    ic_points: numIC,
    ic_bytes: numIC * 64
  }
}, null, 2));

console.log('\n✅ Saved to keys/private_counter_vk_arkworks.bin');
console.log('✅ Saved to keys/private_counter_vk_arkworks.json');
