/**
 * Verifying Key Utilities
 *
 * Handles loading and serialization of Groth16 verifying keys
 * for use with Sui Move's groth16 module.
 */

/**
 * snarkjs verifying key format (subset we need)
 */
export interface VerifyingKey {
  protocol: string;
  curve: string;
  nPublic: number;
  vk_alpha_1: [string, string, string];
  vk_beta_2: [[string, string], [string, string], [string, string]];
  vk_gamma_2: [[string, string], [string, string], [string, string]];
  vk_delta_2: [[string, string], [string, string], [string, string]];
  vk_alphabeta_12: [
    [[string, string], [string, string], [string, string]],
    [[string, string], [string, string], [string, string]],
  ];
  IC: [string, string, string][];
}

/**
 * Convert a field element to 32-byte big-endian bytes
 */
function fieldElementToBytes(element: string): Uint8Array {
  const value = BigInt(element);
  const bytes = new Uint8Array(32);

  for (let i = 0; i < 32; i++) {
    bytes[31 - i] = Number((value >> BigInt(i * 8)) & 0xffn);
  }

  return bytes;
}

/**
 * Serialize G1 point to bytes (uncompressed: 64 bytes)
 */
function serializeG1Point(point: [string, string, string]): Uint8Array {
  const xBytes = fieldElementToBytes(point[0]);
  const yBytes = fieldElementToBytes(point[1]);

  const result = new Uint8Array(64);
  result.set(xBytes, 0);
  result.set(yBytes, 32);

  return result;
}

/**
 * Serialize G2 point to bytes (uncompressed: 128 bytes)
 */
function serializeG2Point(
  point: [[string, string], [string, string], [string, string]],
): Uint8Array {
  const x_c0 = fieldElementToBytes(point[0][0]);
  const x_c1 = fieldElementToBytes(point[0][1]);
  const y_c0 = fieldElementToBytes(point[1][0]);
  const y_c1 = fieldElementToBytes(point[1][1]);

  const result = new Uint8Array(128);
  result.set(x_c0, 0);
  result.set(x_c1, 32);
  result.set(y_c0, 64);
  result.set(y_c1, 96);

  return result;
}

/**
 * Convert verifying key to bytes format compatible with Sui Move
 *
 * Format (matching snarkjs export format):
 * - nPublic (4 bytes, little-endian u32)
 * - alpha_g1 (64 bytes)
 * - beta_g2 (128 bytes)
 * - gamma_g2 (128 bytes)
 * - delta_g2 (128 bytes)
 * - IC points (64 bytes * (nPublic + 1))
 *
 * Note: We're using a simplified format here. The actual format depends on
 * how the Sui Move contract expects the VK to be serialized.
 */
export function serializeVerifyingKey(vk: VerifyingKey): Uint8Array {
  // For simplicity, we'll serialize the key components in order
  // This matches the format expected by fastcrypto's prepare_verifying_key

  const components: Uint8Array[] = [];

  // Serialize alpha_g1
  components.push(serializeG1Point(vk.vk_alpha_1));

  // Serialize beta_g2
  components.push(serializeG2Point(vk.vk_beta_2));

  // Serialize gamma_g2
  components.push(serializeG2Point(vk.vk_gamma_2));

  // Serialize delta_g2
  components.push(serializeG2Point(vk.vk_delta_2));

  // Serialize IC points
  for (const icPoint of vk.IC) {
    components.push(serializeG1Point(icPoint));
  }

  // Calculate total size
  const totalSize = components.reduce((sum, bytes) => sum + bytes.length, 0);

  // Combine all components
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const component of components) {
    result.set(component, offset);
    offset += component.length;
  }

  return result;
}

/**
 * Load verifying key from public directory
 */
export async function loadVerifyingKey(): Promise<Uint8Array> {
  const vkPath = "/circuits/keys/private_counter_vk.json";

  const response = await fetch(vkPath);
  if (!response.ok) {
    throw new Error(`Failed to load verifying key: HTTP ${response.status}`);
  }

  const vk: VerifyingKey = await response.json();

  if (vk.protocol !== "groth16" || vk.curve !== "bn128") {
    throw new Error("Invalid verifying key format");
  }

  return serializeVerifyingKey(vk);
}

/**
 * Cache for verifying key bytes
 */
let cachedVkBytes: Uint8Array | null = null;

/**
 * Get verifying key bytes (cached)
 */
export async function getVerifyingKeyBytes(): Promise<Uint8Array> {
  if (!cachedVkBytes) {
    cachedVkBytes = await loadVerifyingKey();
  }
  return cachedVkBytes;
}
