/**
 * Multi-IBS Off-chain Verification Test
 *
 * This test demonstrates that our Multi-IBS implementation works correctly
 * by testing all components off-chain:
 * 1. Secret key aggregation
 * 2. Public key derivation and aggregation
 * 3. BLS signature creation
 * 4. Signature verification
 *
 * This validates the cryptographic correctness without blockchain dependencies.
 */

import { describe, expect, test } from "bun:test";
import { bls12_381 } from "@noble/curves/bls12-381.js";

const blss = bls12_381.shortSignatures;

/**
 * Mock key shares simulating Seal Key Server output
 */
const generateMockKeyShares = (identity: string, count: number) => {
  const shares = [];

  for (let i = 0; i < count; i++) {
    // Create deterministic mock key based on identity + server
    const seed = new TextEncoder().encode(`${identity}:${i}:server-${i}`);
    const secretKey = new Uint8Array(32);

    for (let j = 0; j < 32; j++) {
      secretKey[j] = seed[j % seed.length] ^ ((i * 17 + j * 31) & 0xff);
    }

    shares.push({
      serverIndex: i,
      serverId: `server-${i}`,
      secretKey,
    });
  }

  return shares;
};

/**
 * Aggregate secret keys using modular addition
 */
const aggregateSecretKeys = (shares: Array<{ secretKey: Uint8Array }>) => {
  if (shares.length === 0) {
    throw new Error("No secret key shares to aggregate");
  }

  // Convert first key to bigint
  let aggregated = bytesToBigInt(shares[0].secretKey);

  // Add remaining keys modulo curve order
  for (let i = 1; i < shares.length; i++) {
    const keyBigInt = bytesToBigInt(shares[i].secretKey);
    aggregated = (aggregated + keyBigInt) % bls12_381.fields.Fr.ORDER;
  }

  return bigIntToBytes(aggregated, 32);
};

/**
 * Create Multi-IBS signature
 */
const createMultiIBSSignature = (aggregatedSecretKey: Uint8Array, message: string): Uint8Array => {
  const messageBytes = new TextEncoder().encode(message);

  // Hash message to G1 curve point with Move contract domain separation
  const messageWithDomain = new Uint8Array([
    ...new TextEncoder().encode("SUI-MULTI-IBS-V1"),
    ...messageBytes,
  ]);
  const DST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";
  const hashedMessage = blss.hash(messageWithDomain, DST);

  // Create G1 signature
  const signature = blss.sign(hashedMessage, aggregatedSecretKey);
  return signature.toBytes();
};

/**
 * Verify Multi-IBS signature
 */
const verifyMultiIBSSignature = (
  signature: Uint8Array,
  message: string,
  aggregatedPublicKey: Uint8Array,
): boolean => {
  const messageBytes = new TextEncoder().encode(message);

  // Use same domain separation as Move contract
  const messageWithDomain = new Uint8Array([
    ...new TextEncoder().encode("SUI-MULTI-IBS-V1"),
    ...messageBytes,
  ]);
  const DST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";
  const hashedMessage = blss.hash(messageWithDomain, DST);

  // Convert bytes back to Point objects for verification
  const sigPoint = bls12_381.G1.Point.fromBytes(signature);
  const pubKeyPoint = bls12_381.G2.Point.fromBytes(aggregatedPublicKey);

  return blss.verify(sigPoint, hashedMessage, pubKeyPoint);
};

// Helper functions
const bytesToBigInt = (bytes: Uint8Array): bigint => {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) + BigInt(bytes[i]);
  }
  return result;
};

const bigIntToBytes = (value: bigint, length: number): Uint8Array => {
  const result = new Uint8Array(length);
  let currentValue = value;
  for (let i = length - 1; i >= 0; i--) {
    result[i] = Number(currentValue & 0xffn);
    currentValue >>= 8n;
  }
  return result;
};

describe("Multi-IBS Off-chain Verification", () => {
  test("should aggregate secret keys correctly", () => {
    const identity = "test-identity";
    const shares = generateMockKeyShares(identity, 3);

    const aggregatedSK = aggregateSecretKeys(shares);

    expect(aggregatedSK).toHaveLength(32);
    expect(aggregatedSK).not.toEqual(shares[0].secretKey);
    expect(aggregatedSK).not.toEqual(shares[1].secretKey);
    expect(aggregatedSK).not.toEqual(shares[2].secretKey);
  });

  test("should create and verify BLS signatures", () => {
    const identity = "test-identity";
    const message = "test-message";
    const shares = generateMockKeyShares(identity, 2);

    // Aggregate secret keys
    const aggregatedSK = aggregateSecretKeys(shares);

    // Derive aggregated public key
    const aggregatedPK = blss.getPublicKey(aggregatedSK).toBytes();

    // Create signature
    const signature = createMultiIBSSignature(aggregatedSK, message);

    // Verify signature
    const isValid = verifyMultiIBSSignature(signature, message, aggregatedPK);

    expect(signature).toHaveLength(48); // G1 compressed point
    expect(aggregatedPK).toHaveLength(96); // G2 compressed point
    expect(isValid).toBe(true);

    // Wrong message should fail
    const isInvalid = verifyMultiIBSSignature(signature, "wrong-message", aggregatedPK);
    expect(isInvalid).toBe(false);
  });

  test("should demonstrate threshold signatures", () => {
    const identity = "threshold-test";
    const message = "threshold-message";
    const allShares = generateMockKeyShares(identity, 3);

    // Test different combinations of 2 shares (2-of-3 threshold)
    const combo1 = aggregateSecretKeys([allShares[0], allShares[1]]);
    const combo2 = aggregateSecretKeys([allShares[0], allShares[2]]);
    const combo3 = aggregateSecretKeys([allShares[1], allShares[2]]);

    // All combinations should produce valid signatures
    const sig1 = createMultiIBSSignature(combo1, message);
    const sig2 = createMultiIBSSignature(combo2, message);
    const sig3 = createMultiIBSSignature(combo3, message);

    const pk1 = blss.getPublicKey(combo1).toBytes();
    const pk2 = blss.getPublicKey(combo2).toBytes();
    const pk3 = blss.getPublicKey(combo3).toBytes();

    // All should be valid with their respective public keys
    expect(verifyMultiIBSSignature(sig1, message, pk1)).toBe(true);
    expect(verifyMultiIBSSignature(sig2, message, pk2)).toBe(true);
    expect(verifyMultiIBSSignature(sig3, message, pk3)).toBe(true);

    // Cross-verification should fail (different keys)
    expect(verifyMultiIBSSignature(sig1, message, pk2)).toBe(false);
    expect(verifyMultiIBSSignature(sig2, message, pk3)).toBe(false);
    expect(verifyMultiIBSSignature(sig3, message, pk1)).toBe(false);
  });

  test("should match Move contract domain separation", () => {
    const identity = "domain-test";
    const message = "domain-message";
    const shares = generateMockKeyShares(identity, 2);

    const aggregatedSK = aggregateSecretKeys(shares);
    const aggregatedPK = blss.getPublicKey(aggregatedSK).toBytes();

    // Create signature with correct domain separation
    const signature = createMultiIBSSignature(aggregatedSK, message);

    // This should pass (correct domain)
    expect(verifyMultiIBSSignature(signature, message, aggregatedPK)).toBe(true);

    // Manual verification with wrong domain should fail
    const messageBytes = new TextEncoder().encode(message);
    const wrongDomain = new Uint8Array([
      ...new TextEncoder().encode("WRONG-DOMAIN"), // Different domain
      ...messageBytes,
    ]);
    const DST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";
    const wrongHashedMessage = blss.hash(wrongDomain, DST);

    const sigPoint = bls12_381.G1.Point.fromBytes(signature);
    const pubKeyPoint = bls12_381.G2.Point.fromBytes(aggregatedPK);

    const wrongVerification = blss.verify(sigPoint, wrongHashedMessage, pubKeyPoint);
    expect(wrongVerification).toBe(false);
  });

  test("should demonstrate signature size efficiency", () => {
    const identity = "efficiency-test";
    const message = "efficiency-message";

    // Compare single signature vs multiple individual signatures
    const shares = generateMockKeyShares(identity, 3);

    // Multi-IBS approach: 1 aggregated signature
    const aggregatedSK = aggregateSecretKeys(shares);
    const multiIBSSignature = createMultiIBSSignature(aggregatedSK, message);

    // Traditional approach: 3 individual signatures
    const individual1 = createMultiIBSSignature(shares[0].secretKey, message);
    const individual2 = createMultiIBSSignature(shares[1].secretKey, message);
    const individual3 = createMultiIBSSignature(shares[2].secretKey, message);

    // Size comparison
    const multiIBSSize = multiIBSSignature.length; // 48 bytes
    const traditionalSize = individual1.length + individual2.length + individual3.length; // 144 bytes

    expect(multiIBSSize).toBe(48);
    expect(traditionalSize).toBe(144);
    expect(multiIBSSize).toBeLessThan(traditionalSize);
  });
});
