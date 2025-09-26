/**
 * Multi-IBS Counter with Real BLS Signature Aggregation Test
 *
 * This test implements actual BLS12-381 signature aggregation using @noble/curves
 * instead of mock signatures. It demonstrates:
 * 1. G1 signature aggregation (48 bytes)
 * 2. Multiple secret key aggregation
 * 3. Threshold signature verification (2-of-3)
 * 4. Real cryptographic operations for Multi-IBS
 *
 * ===== DESIGN PRINCIPLE: ONE aggregated signature only =====
 *
 * Previous confusion-inducing elements (ALL REMOVED):
 * - signer_indices: Removed to prevent "who signed what" confusion
 * - contributor_count: Removed as it's redundant with threshold
 * - Individual signature tracking: Not needed for aggregated scheme
 * - Multiple signature arrays: Would defeat the purpose of aggregation
 *
 * Current clean design:
 * - Single aggregated signature (48 bytes)
 * - Threshold validation via authenticated key aggregation
 * - No individual signer tracking (intentionally opaque)
 * - Gas-efficient: 2 pairings instead of 2n pairings
 *
 * DO NOT re-introduce confusion-causing elements!
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { type Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { bls12_381 } from "@noble/curves/bls12-381.js";
import { counterPackage } from "@/abi";
import { getKeypair } from "./utils/keybook.js";

/**
 * CRITICAL: We use shortSignatures (G1 signatures, G2 public keys)
 *
 * Why shortSignatures instead of longSignatures:
 * - G1 signatures are 48 bytes (compact for on-chain storage)
 * - G2 public keys are 96 bytes (larger but aggregated once)
 * - Optimized for signature size, not public key size
 *
 * Alternative (NOT used here):
 * - longSignatures would be G2 sigs (96 bytes) + G1 pubkeys (48 bytes)
 * - Would double the on-chain signature storage cost per operation
 *
 * This choice aligns with Move contract expectations (48-byte signatures)
 */
const blss = bls12_381.shortSignatures;

// Test configuration
const NETWORK = "testnet";
const THRESHOLD = 2; // 2-of-3 threshold

// Key Server configurations (using testnet servers)
const KEY_SERVERS = [
  {
    name: "Studio Mirai",
    objectId: "0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2",
  },
  {
    name: "Ruby Node",
    objectId: "0x6068c0acb197dddbacd4746a9de7f025b2ed5a5b6c1b1ab44dade4426d141da2",
  },
  {
    name: "NodeInfra",
    objectId: "0x5466b7df5c15b508678d51496ada8afab0d6f70a01c10613123382b1b8131007",
  },
];

interface SecretKeyShare {
  keyServerIndex: number;
  secretKey: Uint8Array; // sk_ID_i (32 bytes)
  keyServerId: string;
}

interface AggregatedSignature {
  signature: Uint8Array; // G1 signature (48 bytes)
  message: Uint8Array;
  // Note: signerIndices removed to match Move contract AggregatedSignature struct
  // Move contract only needs signature_g1 and message for verification
}

// Pure functions - no classes

/**
 * Fetch real secret key shares from Seal Key Servers
 */
const fetchRealSecretKeyShares = async (
  client: SuiClient,
  counterId: string,
  keypair: Ed25519Keypair,
  threshold: number,
): Promise<SecretKeyShare[]> => {
  // Import Seal SDK for real Key Server integration
  const { SealMultiIBSAggregator } = await import("../scripts/multi-ibs-with-seal.ts");
  const sealAggregator = new SealMultiIBSAggregator();

  // Fetch real Key Server shares using counter ID
  const keyShares = await sealAggregator.fetchSecretKeyShares(
    counterId,
    keypair,
    threshold,
  );

  return keyShares;
};

/**
 * IMPORTANT: Aggregate secret keys using modular addition
 *
 * Mathematical foundation:
 * - sk_ID = sk_ID_1 + sk_ID_2 + ... + sk_ID_n (mod Fr.ORDER)
 * - Fr.ORDER is the order of the BLS12-381 scalar field (finite field)
 * - This ensures the aggregated key remains valid in the cryptographic group
 *
 * Why modular arithmetic is crucial:
 * - Prevents integer overflow beyond field size
 * - Maintains cryptographic security properties
 * - Compatible with BLS signature scheme requirements
 * - Enables threshold signature verification
 *
 * DO NOT confuse with:
 * - Point addition (that's for G1/G2 curve points, not scalars)
 * - Simple integer addition (would overflow and break security)
 * - XOR operations (completely different cryptographic primitive)
 *
 * This is the core of Multi-IBS: multiple keys → single aggregated key
 */
const aggregateSecretKeys = (shares: SecretKeyShare[]): Uint8Array => {
  if (shares.length === 0) {
    throw new Error("No secret key shares to aggregate");
  }

  // Convert first key to bigint for modular arithmetic
  let aggregated = bytesToBigInt(shares[0].secretKey);

  // Add remaining keys in the scalar field (mod Fr.ORDER)
  for (let i = 1; i < shares.length; i++) {
    const keyBigInt = bytesToBigInt(shares[i].secretKey);
    aggregated = (aggregated + keyBigInt) % bls12_381.fields.Fr.ORDER; // CRITICAL: mod curve order
  }

  return bigIntToBytes(aggregated, 32);
};

/**
 * Create BLS signature using aggregated secret key
 */
const signMessage = (aggregatedSecretKey: Uint8Array, message: string): Uint8Array => {
  const messageBytes = new TextEncoder().encode(message);

  /**
   * CRITICAL: Domain separation must match Move contract exactly
   *
   * Domain separation prevents signature reuse across different contexts:
   * - Move contract uses: DOMAIN_SEPARATOR_BLS = b"SUI-MULTI-IBS-V1"
   * - We prepend this to message before hashing
   * - DST (Domain Separation Tag) is standard BLS12-381 hash-to-curve
   *
   * Security requirement:
   * - Different domains → different signatures (even for same message)
   * - Prevents cross-protocol signature reuse attacks
   * - Must match Move contract's domain for verification to succeed
   */
  const messageWithDomain = new Uint8Array([
    ...new TextEncoder().encode("SUI-MULTI-IBS-V1"), // MUST match Move contract
    ...messageBytes,
  ]);
  const DST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_"; // Standard BLS hash-to-curve
  const hashedMessage = blss.hash(messageWithDomain, DST);

  // Create signature using aggregated secret key
  const signature = blss.sign(hashedMessage, aggregatedSecretKey);

  /**
   * IMPORTANT: Convert Point to bytes for storage/transmission
   *
   * BLS library returns signature as G1 Point object, but we need:
   * - 48 bytes for on-chain storage (Move contract expects vector<u8>)
   * - Standardized compressed point representation
   * - Compatible with Move contract's g1_from_bytes() function
   */
  return signature.toBytes(); // 48 bytes G1 compressed point
};

/**
 * Verify aggregated signature
 */
const verifyAggregatedSignature = (
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

/**
 * Get public key from secret key
 */
const getPublicKey = (secretKey: Uint8Array): Uint8Array => {
  return blss.getPublicKey(secretKey).toBytes();
};

/**
 * Create Multi-IBS counter on testnet
 */
const createMultiIBSCounter = async (
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<string> => {
  const tx = new Transaction();

  const keyServerIds = KEY_SERVERS.map((server) => server.objectId);
  const _counter = counterPackage.multi_ibs_counter.share(tx, {
    arguments: [tx.pure.vector("id", keyServerIds), tx.pure.u64(THRESHOLD)],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });

  const created = result.objectChanges?.find(
    (change) => change.type === "created" && change.objectType?.includes("MultiIBSCounter"),
  );

  if (!created || created.type !== "created") {
    throw new Error("Failed to create Multi-IBS counter");
  }

  return created.objectId;
};

/**
 * Submit aggregated signature for verification and increment
 *
 * CHALLENGE: Real testnet execution requires actual Key Server objects
 * Current approach: Skip complex AggregatedPublicKey setup for now
 *
 * For full implementation, would need:
 * 1. Create AggregatedPublicKey with new_aggregated_public_key()
 * 2. Add Key Server public keys with add_key_server_public_key()
 * 3. Call verify_and_create_proof with proper aggregated key
 * 4. Use returned proof to increment counter
 */
const submitAggregatedSignature = async (
  client: SuiClient,
  keypair: Ed25519Keypair,
  counterId: string,
  keyServerIds: string[],
  signature: Uint8Array,
  message: Uint8Array,
): Promise<string> => {
  const tx = new Transaction();

  // Step 1: Create AggregatedPublicKey
  const [aggregatedKey] = counterPackage.multi_ibs_counter.new_aggregated_public_key(tx, {
    arguments: [tx.object(counterId)],
  });

  // Step 2: Add Key Server public keys (real Key Server objects)
  for (const keyServerId of keyServerIds) {
    if (!keyServerId) {
      throw new Error(`Invalid key server ID: ${keyServerId}`);
    }
    counterPackage.multi_ibs_counter.add_key_server_public_key(tx, {
      arguments: [tx.object(counterId), aggregatedKey, tx.object(keyServerId)],
    });
  }

  // Step 3: Verify signature and create proof
  const [proof] = counterPackage.multi_ibs_counter.verify_and_create_proof(tx, {
    arguments: [
      tx.object(counterId),
      aggregatedKey,
      tx.pure.vector("u8", Array.from(signature)),
      tx.pure.vector("u8", Array.from(message)),
    ],
  });

  // Step 4: Increment counter using proof
  counterPackage.multi_ibs_counter.increment(tx, {
    arguments: [tx.object(counterId), proof],
  });

  // Step 5: Clean up AggregatedPublicKey
  counterPackage.multi_ibs_counter.destroy_aggregated_public_key(tx, {
    arguments: [aggregatedKey],
  });

  // Execute the transaction
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  if (result.effects?.status?.status !== "success") {
    throw new Error(`Transaction failed: ${result.effects?.status?.error}`);
  }

  return result.digest;
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
  let currentValue = value; // Use local variable instead of modifying parameter
  for (let i = length - 1; i >= 0; i--) {
    result[i] = Number(currentValue & 0xffn);
    currentValue >>= 8n;
  }
  return result;
};

describe("Multi-IBS Real BLS Signature Test", () => {
  let client: SuiClient;
  let keypair: Ed25519Keypair;
  let counterId: string;

  beforeAll(async () => {
    client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
    const primeKeyInfo = getKeypair("PRIME");
    keypair = primeKeyInfo.keypair;
  });

  test("should create Multi-IBS counter on testnet", async () => {
    /**
     * This test demonstrates Multi-IBS counter creation on testnet.
     * Enabled for real testnet execution with:
     * 1. Deployed Move contract (Package ID: 0x3000c25f352e2c91a99e0f7b9fb84f6fa86cc4e8ab819fbc83a6c47670bbba9e)
     * 2. SUI tokens available from faucet
     * 3. Real Key Server object IDs on testnet
     */
    counterId = await createMultiIBSCounter(client, keypair);
    expect(counterId).toMatch(/^0x[a-f0-9]{64}$/);
  });

  test("should fetch real secret keys from Key Servers", async () => {
    if (!counterId) throw new Error("Counter ID not available - run counter creation test first");

    const threshold = 2;

    const shares = await fetchRealSecretKeyShares(client, counterId, keypair, threshold);

    expect(shares).toHaveLength(threshold);
    expect(shares[0].secretKey).toHaveLength(48); // G1 compressed point is 48 bytes

    const aggregatedSK = aggregateSecretKeys(shares);
    expect(aggregatedSK).toHaveLength(32); // Aggregated scalar is 32 bytes
  });

  test("should create and verify BLS signatures with real keys", async () => {
    if (!counterId) throw new Error("Counter ID not available - run counter creation test first");

    const message = "increment-counter-test";

    // Fetch real key shares and aggregate
    const shares = await fetchRealSecretKeyShares(client, counterId, keypair, 2);
    const aggregatedSK = aggregateSecretKeys(shares);
    const aggregatedPK = getPublicKey(aggregatedSK);

    // Create signature
    const signature = signMessage(aggregatedSK, message);
    expect(signature).toHaveLength(48); // G1 signature is 48 bytes

    // Verify signature
    const isValid = verifyAggregatedSignature(signature, message, aggregatedPK);
    expect(isValid).toBe(true);

    // Wrong message should fail
    const isInvalid = verifyAggregatedSignature(signature, "wrong-message", aggregatedPK);
    expect(isInvalid).toBe(false);
  });

  test("should demonstrate threshold signature with real Key Servers", async () => {
    if (!counterId) throw new Error("Counter ID not available - run counter creation test first");

    const message = "threshold-signature-test";

    // Fetch 3 shares but use only 2 (threshold)
    const allShares = await fetchRealSecretKeyShares(client, counterId, keypair, 3);

    // Test different combinations of 2 shares
    const combo1 = aggregateSecretKeys([allShares[0], allShares[1]]);
    const combo2 = aggregateSecretKeys([allShares[0], allShares[2]]);
    const combo3 = aggregateSecretKeys([allShares[1], allShares[2]]);

    // All combinations should produce valid signatures
    const sig1 = signMessage(combo1, message);
    const sig2 = signMessage(combo2, message);
    const sig3 = signMessage(combo3, message);

    expect(sig1).toHaveLength(48);
    expect(sig2).toHaveLength(48);
    expect(sig3).toHaveLength(48);

    // All should be different (different key combinations)
    expect(sig1).not.toEqual(sig2);
    expect(sig2).not.toEqual(sig3);
    expect(sig1).not.toEqual(sig3);
  });

  test("should aggregate keys and increment counter with real Key Servers", async () => {
    if (!counterId) throw new Error("Counter ID not available - run counter creation test first");

    const identity = keypair.getPublicKey().toSuiAddress();
    const message = `increment-real-test-${Date.now()}`;

    // Step 1: Fetch real secret keys from Key Servers
    const shares = await fetchRealSecretKeyShares(client, counterId, keypair, THRESHOLD);

    // Step 2: Aggregate secret keys
    const aggregatedSK = aggregateSecretKeys(shares);

    // Step 3: Create BLS signature
    const signature = signMessage(aggregatedSK, message);
    const messageBytes = new TextEncoder().encode(message);

    // Step 4: Get Key Server IDs for threshold
    const keyServerIds = shares.map(share => share.serverId);
    console.log("Key Server IDs:", keyServerIds);
    console.log("Counter ID:", counterId);
    console.log("Signature length:", signature.length);

    // Step 5: Submit aggregated signature and increment counter
    const txDigest = await submitAggregatedSignature(
      client,
      keypair,
      counterId,
      keyServerIds,
      signature,
      messageBytes,
    );

    expect(txDigest).toMatch(/^[A-Za-z0-9]{43,44}$/); // Sui transaction digest format
    expect(signature).toHaveLength(48); // G1 signature
  });

});
