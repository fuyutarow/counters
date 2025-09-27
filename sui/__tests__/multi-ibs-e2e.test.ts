/**
 * Multi-IBS End-to-End Integration Test
 *
 * This test demonstrates the complete Multi-IBS (Multiple Identity-Based Signatures) flow:
 * 1. Counter creation with real Seal Key Server public keys
 * 2. BLS signature generation using threshold IBE key derivation
 * 3. On-chain signature verification and proof creation
 * 4. Counter increment with verified signature
 *
 * Critical Path: Create → Sign → Verify → Increment
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { type Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { bls12_381 } from "@noble/curves/bls12-381.js";
import { counterPackage, type Multi_ibs_counterMultiIBSCounterType } from "@/abi";
import { getKeypair } from "./utils/keybook.js";
import { createRealSealShardCounter } from "./utils/real-seal-keys.ts";

// Configuration
const NETWORK = "testnet";
const THRESHOLD = 2; // 2-of-3 threshold

// Real Key Server configurations from testnet
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

// BLS signature utilities
const _blss = bls12_381.shortSignatures;

/**
 * Get counter value from on-chain object
 */
const getCounterValue = async (client: SuiClient, counterId: string): Promise<number> => {
  const counterObject = await client.getObject({
    id: counterId,
    options: { showContent: true, showType: true },
  });

  if (!counterObject.data?.content || counterObject.data.content.dataType !== "moveObject") {
    throw new Error(`Invalid counter object: ${counterId}`);
  }

  const fields = counterObject.data.content.fields as Multi_ibs_counterMultiIBSCounterType;
  return Number(fields.value);
};

/**
 * Create Multi-IBS counter with real Seal Key Server public keys
 */
const createMultiIBSCounter = async (
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<string> => {
  const tx = new Transaction();
  const keyServerIds = KEY_SERVERS.map((server) => server.objectId);

  // Fetch real public keys from Seal Key Servers (NO MOCKS)
  const realCounterData = await createRealSealShardCounter(keyServerIds, THRESHOLD, NETWORK);

  counterPackage.multi_ibs_counter.share(tx, {
    arguments: [
      tx.pure.vector("id", realCounterData.keyServerIds),
      tx.pure.vector("vector<u8>", realCounterData.publicKeys),
      tx.pure.u64(THRESHOLD),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });

  if (result.effects?.status?.status !== "success") {
    throw new Error(`Counter creation failed: ${result.effects?.status?.error}`);
  }

  const created = result.objectChanges?.find(
    (change) => change.type === "created" && change.objectType?.includes("MultiIBSCounter"),
  );

  if (!created || created.type !== "created") {
    throw new Error("Failed to find created Multi-IBS counter");
  }

  return created.objectId;
};

/**
 * Generate BLS signature using real Seal Key Server IBE key derivation
 */
const generateBLSSignature = async (
  _client: SuiClient,
  counterId: string,
  keypair: Ed25519Keypair,
  message: string,
): Promise<{ signature: Uint8Array; keyServerIds: string[] }> => {
  // Import Seal SDK for real Key Server integration
  const { SealMultiIBSAggregator } = await import("../scripts/multi-ibs-with-seal.ts");
  const sealAggregator = new SealMultiIBSAggregator();

  try {
    // Step 1: Fetch IBE key shares from real Key Servers
    const keyShares = await sealAggregator.fetchSecretKeyShares(counterId, keypair, THRESHOLD);

    if (keyShares.length !== THRESHOLD) {
      throw new Error(`Expected ${THRESHOLD} key shares, got ${keyShares.length}`);
    }

    // Step 2: Aggregate secret keys
    const aggregatedSecretKey = sealAggregator.aggregateSecretKeys(keyShares);

    // Step 3: Create BLS signature
    const signature = sealAggregator.createMultiIBSSignature(
      aggregatedSecretKey,
      message,
      keypair.getPublicKey().toSuiAddress(),
    );

    const keyServerIds = keyShares.map((share) => share.serverId);

    return {
      signature: signature.signature,
      keyServerIds,
    };
  } catch (error) {
    throw new Error(`BLS signature generation failed: ${error}`);
  }
};

/**
 * Verify signature and create proof on-chain
 */
const verifySignatureAndCreateProof = async (
  client: SuiClient,
  counterId: string,
  keypair: Ed25519Keypair,
  signature: Uint8Array,
  message: string,
  keyServerIds: string[],
): Promise<void> => {
  const tx = new Transaction();
  const messageBytes = new TextEncoder().encode(message);

  // Step 1: Create AggregatedPublicKey
  const [aggregatedKey] = counterPackage.multi_ibs_counter.new_aggregated_public_key(tx, {
    arguments: [tx.object(counterId)],
  });

  // Step 2: Add Key Server public keys from seal_shard_table (no Key Server object access)
  // The public keys are already stored in the Counter's seal_shard_table from Step 1
  // aggregate_seal_shard_pubkey reads from the table, not from Key Server objects
  for (const keyServerId of keyServerIds) {
    counterPackage.multi_ibs_counter.aggregate_seal_shard_pubkey(tx, {
      arguments: [tx.object(counterId), aggregatedKey, tx.pure.id(keyServerId)],
    });
  }

  // Step 3: Verify signature and create proof
  const [proof] = counterPackage.multi_ibs_counter.verify_and_create_proof(tx, {
    arguments: [
      tx.object(counterId),
      aggregatedKey,
      tx.pure.vector("u8", Array.from(signature)),
      tx.pure.vector("u8", Array.from(messageBytes)),
    ],
  });

  // Step 4: Increment counter with proof
  counterPackage.multi_ibs_counter.increment(tx, {
    arguments: [tx.object(counterId), proof],
  });

  // Step 5: Clean up AggregatedPublicKey
  counterPackage.multi_ibs_counter.destroy_aggregated_public_key(tx, {
    arguments: [aggregatedKey],
  });

  // Set manual gas budget to avoid dry run failure
  tx.setGasBudget(10000000); // 10M MIST

  // Execute the transaction
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  if (result.effects?.status?.status !== "success") {
    throw new Error(`Signature verification failed: ${result.effects?.status?.error}`);
  }
};

describe("Multi-IBS End-to-End Integration", () => {
  let client: SuiClient;
  let keypair: Ed25519Keypair;
  let counterId: string;

  beforeAll(async () => {
    client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
    const primeKeyInfo = getKeypair("PRIME");
    keypair = primeKeyInfo.keypair;
  });

  test("Step 1: creates Multi-IBS counter with real Seal Key Server public keys", async () => {
    counterId = await createMultiIBSCounter(client, keypair);

    // Verify counter was created with correct format
    expect(counterId).toMatch(/^0x[a-f0-9]{64}$/);

    // Wait for object to be indexed
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify initial counter value is 0
    const initialValue = await getCounterValue(client, counterId);
    expect(initialValue).toBe(0);
  });

  test("Step 2: generates BLS signature with threshold IBE keys", async () => {
    if (!counterId) throw new Error("Counter not created - run Step 1 first");

    const message = `test-signature-${Date.now()}`;
    const result = await generateBLSSignature(client, counterId, keypair, message);

    // Verify signature format (G1 compressed point = 48 bytes)
    expect(result.signature).toHaveLength(48);
    expect(result.keyServerIds).toHaveLength(THRESHOLD);

    // Verify all key server IDs are valid
    for (const serverId of result.keyServerIds) {
      expect(serverId).toMatch(/^0x[a-f0-9]{64}$/);
    }
  });

  test("Step 3: verifies signature and creates proof on-chain", async () => {
    if (!counterId) throw new Error("Counter not created - run Step 1 first");

    const message = `verification-test-${Date.now()}`;
    const { signature, keyServerIds } = await generateBLSSignature(
      client,
      counterId,
      keypair,
      message,
    );

    // This should not throw an error if verification succeeds
    await verifySignatureAndCreateProof(
      client,
      counterId,
      keypair,
      signature,
      message,
      keyServerIds,
    );
  });

  test("Step 4: increments counter with verified signature", async () => {
    if (!counterId) throw new Error("Counter not created - run Step 1 first");

    const initialValue = await getCounterValue(client, counterId);
    const message = `increment-test-${Date.now()}`;

    const { signature, keyServerIds } = await generateBLSSignature(
      client,
      counterId,
      keypair,
      message,
    );
    await verifySignatureAndCreateProof(
      client,
      counterId,
      keypair,
      signature,
      message,
      keyServerIds,
    );

    // Verify counter was incremented
    const finalValue = await getCounterValue(client, counterId);
    expect(finalValue).toBe(initialValue + 1);
  });

  test("Integration: completes full Multi-IBS flow (create → sign → verify → increment)", async () => {
    // Create new counter for clean integration test
    const integrationCounterId = await createMultiIBSCounter(client, keypair);

    // Verify initial state
    const initialValue = await getCounterValue(client, integrationCounterId);
    expect(initialValue).toBe(0);

    // Generate signature
    const message = `integration-test-${Date.now()}`;
    const { signature, keyServerIds } = await generateBLSSignature(
      client,
      integrationCounterId,
      keypair,
      message,
    );

    // Verify and increment in one transaction
    await verifySignatureAndCreateProof(
      client,
      integrationCounterId,
      keypair,
      signature,
      message,
      keyServerIds,
    );

    // Verify final state
    const finalValue = await getCounterValue(client, integrationCounterId);
    expect(finalValue).toBe(1);
  });
});
