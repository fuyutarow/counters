/**
 * SEAL IBE Multisig End-to-End Integration Test
 *
 * This test demonstrates the complete SEAL IBE multisig flow:
 * 1. Counter creation with real Seal Key Server public keys
 * 2. SEAL IBE signature generation using threshold IBE key derivation
 * 3. On-chain signature verification using pairing equations
 * 4. Counter increment with verified signature
 *
 * Critical Path: Create → Sign → Verify → Increment
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { SealClient, SessionKey } from "@mysten/seal";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { type Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { bls12_381 } from "@noble/curves/bls12-381.js";
import { counterPackage, type Seal_ibe_multisig_counterSealIbeMultisigCounterType } from "@/abi";
import { getKeypair } from "./utils/keybook.js";

// Configuration
const NETWORK = "testnet";
const THRESHOLD = 2; // 2-of-3 threshold
const COUNTER_PACKAGE_ID = counterPackage.packageId;

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

// Interfaces for SEAL IBE multisig
interface KeyShare {
  serverIndex: number;
  serverId: string;
  secretKey: Uint8Array; // sk_ID_i as G1Element bytes
}

interface SealIbeMultisigSignature {
  signature: Uint8Array; // G1 signature (48 bytes)
  message: Uint8Array;
  identity: string;
}

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

  const fields = counterObject.data.content
    .fields as Seal_ibe_multisig_counterSealIbeMultisigCounterType;
  return Number(fields.value);
};

/**
 * Fetch real public keys from Seal Key Servers using getObject
 */
const getRealSealShardPublicKeys = async (
  keyServerIds: string[],
  network: "testnet" | "mainnet" = "testnet",
): Promise<Uint8Array[]> => {
  const client = new SuiClient({ url: getFullnodeUrl(network) });
  const publicKeys: Uint8Array[] = [];

  for (const keyServerId of keyServerIds) {
    try {
      // Get Key Server object directly
      const keyServerObj = await client.getObject({
        id: keyServerId,
        options: { showContent: true },
      });

      if (keyServerObj.error) {
        throw new Error(`Failed to fetch Key Server object: ${keyServerObj.error}`);
      }

      const content = keyServerObj.data?.content;
      if (!content || content.dataType !== "moveObject") {
        throw new Error(`Invalid Key Server object structure: ${keyServerId}`);
      }

      // KeyServer has versioned structure - we need to access via v1() for KeyServerV1
      // Get the dynamic field that contains the actual KeyServerV1 data
      const dynamicFields = await client.getDynamicFields({
        parentId: keyServerId,
      });

      // Find the KeyServerV1 dynamic field
      const v1Field = dynamicFields.data.find((field) => field.objectType.includes("KeyServerV1"));

      if (!v1Field) {
        throw new Error(`No KeyServerV1 dynamic field found for ${keyServerId}`);
      }

      // Get the KeyServerV1 object
      const v1Object = await client.getObject({
        id: v1Field.objectId,
        options: { showContent: true },
      });

      if (v1Object.error || !v1Object.data?.content) {
        throw new Error(`Failed to fetch KeyServerV1 object: ${v1Object.error}`);
      }

      const v1Content = v1Object.data.content;
      if (v1Content.dataType !== "moveObject") {
        throw new Error("Invalid KeyServerV1 object structure");
      }

      // Extract pk from KeyServerV1 (nested in dynamic field structure)
      const v1Fields = (v1Content as any).fields;
      const pkField = v1Fields?.value?.fields?.pk;

      if (!pkField) {
        throw new Error(`No pk field found in KeyServerV1 object: ${v1Field.objectId}`);
      }

      // Convert pk bytes to Uint8Array
      // pkField should be an array of numbers or a base64/hex string
      let mpkBytes: Uint8Array;
      if (Array.isArray(pkField)) {
        mpkBytes = new Uint8Array(pkField);
      } else if (typeof pkField === "string") {
        // Try hex first, then base64
        if (pkField.startsWith("0x")) {
          mpkBytes = new Uint8Array(Buffer.from(pkField.slice(2), "hex"));
        } else {
          mpkBytes = new Uint8Array(Buffer.from(pkField, "base64"));
        }
      } else {
        throw new Error(`Unexpected pk field format in ${keyServerId}: ${typeof pkField}`);
      }

      publicKeys.push(mpkBytes);
    } catch (error) {
      throw new Error(`Real Key Server integration failed: ${error}`);
    }
  }

  return publicKeys;
};

/**
 * Create SEAL IBE multisig counter with real Seal Key Server public keys
 */
const createSealIbeMultisigCounter = async (
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<string> => {
  const tx = new Transaction();
  const keyServerIds = KEY_SERVERS.map((server) => server.objectId);

  // Fetch real public keys from Seal Key Servers
  const publicKeys = await getRealSealShardPublicKeys(keyServerIds, NETWORK);

  counterPackage.seal_ibe_multisig_counter.share(tx, {
    arguments: [
      tx.pure.vector("id", keyServerIds),
      tx.pure.vector("vector<u8>", publicKeys),
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

  // Wait for transaction to be processed
  await client.waitForTransaction({ digest: result.digest });

  const created = result.objectChanges?.find(
    (change) => change.type === "created" && change.objectType?.includes("SealIbeMultisigCounter"),
  );

  if (!created || created.type !== "created") {
    throw new Error("Failed to find created SEAL IBE multisig counter");
  }

  return created.objectId;
};

/**
 * Fetch IBE key shares from Seal Key Servers
 */
const fetchSecretKeyShares = async (
  counterId: string,
  signerKeypair: Ed25519Keypair,
  message: string,
  requiredCount: number = THRESHOLD,
): Promise<KeyShare[]> => {
  const suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });

  // Initialize SealClient for real Key Server operations
  const sealClient = new SealClient({
    networkConfig: NETWORK,
    suiClient,
    serverConfigs: [
      {
        objectId: "0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2",
        url: "https://seal.studio-mirai.com", // Studio Mirai
        weight: 1,
      },
      {
        objectId: "0x6068c0acb197dddbacd4746a9de7f025b2ed5a5b6c1b1ab44dade4426d141da2",
        url: "https://seal.ruby-node.com", // Ruby Node
        weight: 1,
      },
      {
        objectId: "0x5466b7df5c15b508678d51496ada8afab0d6f70a01c10613123382b1b8131007",
        url: "https://seal.nodeinfra.com", // NodeInfra
        weight: 1,
      },
    ],
  });

  try {
    // Step 1: Construct IBE Identity = counter_id || signer_address || message
    const signerAddress = signerKeypair.getPublicKey().toSuiAddress();
    const messageBytes = new TextEncoder().encode(message);

    // Prepare message with domain separation matching Move contract
    const messageWithDomain = new Uint8Array([
      ...new TextEncoder().encode("SUI-SEAL-IBE-V1"),
      ...messageBytes,
    ]);

    // Convert counter ID to bytes (same as Move object::id().to_bytes())
    const counterIdBytes = Array.from(Buffer.from(counterId.replace("0x", ""), "hex"));

    // Convert signer address to bytes (same as Move bcs::to_bytes(&address))
    const signerBytes = Array.from(Buffer.from(signerAddress.replace("0x", ""), "hex"));

    // Construct InnerID: counter_id || signer_address || (domain || message)
    // This matches Move seal_approve exactly - NO package_id included
    const ibeIdBytes = [...counterIdBytes, ...signerBytes, ...Array.from(messageWithDomain)];

    // Convert to hex string for Seal SDK
    const ibeIdHex = `0x${Buffer.from(ibeIdBytes).toString("hex")}`;

    // Create a fresh session key for each test to avoid expiration issues
    const sessionKey = await SessionKey.create({
      address: signerAddress,
      packageId: COUNTER_PACKAGE_ID,
      ttlMin: 30, // Increase TTL to 30 minutes to avoid expiration
      signer: signerKeypair,
      suiClient,
    });

    console.log(`✓ SessionKey created for ${signerAddress}`);

    // Step 3: Build seal_approve transaction for txBytes (DO NOT EXECUTE)
    const approveTx = new Transaction();
    approveTx.moveCall({
      target: `${COUNTER_PACKAGE_ID}::seal_ibe_multisig_counter::seal_approve`,
      arguments: [
        approveTx.pure.vector("u8", ibeIdBytes),
        approveTx.object(counterId),
        approveTx.pure.vector("u8", Array.from(messageBytes)),
      ],
    });

    // Generate txBytes without executing the transaction
    const txBytes = await approveTx.build({
      client: suiClient,
      onlyTransactionKind: true,
    });

    const derivedKeys = await sealClient.getDerivedKeys({
      id: ibeIdHex,
      sessionKey,
      txBytes,
      threshold: requiredCount,
    });

    if (!derivedKeys || typeof derivedKeys.size !== "number") {
      throw new Error(`getDerivedKeys returned unexpected result: ${derivedKeys}`);
    }

    // Step 5: Convert Map to KeyShare format
    const keyShares: KeyShare[] = [];
    let serverIndex = 0;

    for (const [serverId, derivedKey] of derivedKeys) {
      const keyBytes = derivedKey.key.toBytes();

      keyShares.push({
        serverIndex,
        serverId,
        secretKey: keyBytes,
      });
      serverIndex++;
    }

    return keyShares;
  } catch (error) {
    throw new Error(`Real Key Server integration failed: ${error}`);
  }
};

/**
 * Aggregate IBE secret keys directly as signature
 */
const aggregateIBESignature = (keyShares: KeyShare[]): Uint8Array => {
  if (keyShares.length === 0) {
    throw new Error("No key shares to aggregate");
  }

  let aggregatedSignature: any;

  try {
    // Parse as compressed G1 point
    aggregatedSignature = bls12_381.G1.Point.fromBytes(keyShares[0].secretKey);
  } catch (_e) {
    // Try uncompressed format if compressed fails
    if (keyShares[0].secretKey.length === 96) {
      try {
        const uncompressed = keyShares[0].secretKey;
        const point = bls12_381.G1.Point.fromHex(Buffer.from(uncompressed).toString("hex"));
        aggregatedSignature = point;
      } catch (e2) {
        throw new Error(`Cannot parse IBE key: ${e2}`);
      }
    } else {
      throw new Error(
        `Invalid IBE key format. Expected 48 or 96 bytes, got ${keyShares[0].secretKey.length}`,
      );
    }
  }

  // Aggregate remaining key shares
  for (let i = 1; i < keyShares.length; i++) {
    try {
      const ibeKey = bls12_381.G1.Point.fromBytes(keyShares[i].secretKey);
      aggregatedSignature = aggregatedSignature.add(ibeKey);
    } catch (e) {
      if (keyShares[i].secretKey.length === 96) {
        const point = bls12_381.G1.Point.fromHex(
          Buffer.from(keyShares[i].secretKey).toString("hex"),
        );
        aggregatedSignature = aggregatedSignature.add(point);
      } else {
        throw new Error(`Failed to parse key share ${i}: ${e}`);
      }
    }
  }

  return aggregatedSignature.toBytes(true); // 48 bytes compressed G1 point
};

/**
 * Create BLS multisig signature using aggregated IBE signature
 */
const createSealIbeMultisigSignature = (
  aggregatedIBESignature: Uint8Array,
  message: string,
  identity: string,
): BlsMultisigSignature => {
  const messageBytes = new TextEncoder().encode(message);

  return {
    signature: aggregatedIBESignature,
    message: messageBytes,
    identity,
  };
};

/**
 * Generate BLS signature using real Seal Key Server IBE key derivation
 */
const generateSealIbeSignature = async (
  _client: SuiClient,
  counterId: string,
  keypair: Ed25519Keypair,
  message: string,
): Promise<{ signature: Uint8Array; keyServerIds: string[] }> => {
  try {
    // Step 1: Fetch IBE key shares from real Key Servers for the specific message
    const keyShares = await fetchSecretKeyShares(counterId, keypair, message, THRESHOLD);

    if (keyShares.length !== THRESHOLD) {
      throw new Error(`Expected ${THRESHOLD} key shares, got ${keyShares.length}`);
    }

    // Step 2: Aggregate IBE keys (which are already message-specific)
    const aggregatedIBESignature = aggregateIBESignature(keyShares);

    // Step 3: Use aggregated IBE key as SEAL IBE signature
    const signature = createSealIbeMultisigSignature(
      aggregatedIBESignature,
      message,
      keypair.getPublicKey().toSuiAddress(),
    );

    const keyServerIds = keyShares.map((share) => share.serverId);

    return {
      signature: signature.signature,
      keyServerIds,
    };
  } catch (error) {
    throw new Error(`SEAL IBE signature generation failed: ${error}`);
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
): Promise<string> => {
  const tx = new Transaction();
  const messageBytes = new TextEncoder().encode(message);

  // Step 1: Create AggregatedPublicKey
  const [aggregatedKey] = counterPackage.seal_ibe_multisig_counter.new_seal_ibe_aggregated_pk(tx, {
    arguments: [tx.object(counterId)],
  });

  // Step 2: Add Key Server public keys from seal_ibe_table (no Key Server object access)
  // The public keys are already stored in the Counter's seal_ibe_table from Step 1
  // aggregate_signer_pubkey reads from the table, not from Key Server objects
  for (const keyServerId of keyServerIds) {
    counterPackage.seal_ibe_multisig_counter.aggregate_signer_pubkey(tx, {
      arguments: [tx.object(counterId), aggregatedKey, tx.pure.id(keyServerId)],
    });
  }

  // Step 3: Verify signature and create proof
  const [proof] = counterPackage.seal_ibe_multisig_counter.verify_and_create_proof(tx, {
    arguments: [
      tx.object(counterId),
      aggregatedKey,
      tx.pure.vector("u8", Array.from(signature)),
      tx.pure.vector("u8", Array.from(messageBytes)),
    ],
  });

  // Step 4: Increment counter with proof
  counterPackage.seal_ibe_multisig_counter.increment(tx, {
    arguments: [tx.object(counterId), proof],
  });

  // Step 5: Clean up AggregatedPublicKey
  counterPackage.seal_ibe_multisig_counter.destroy_seal_ibe_aggregated_pk(tx, {
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

  return result.digest;
};

describe("SEAL IBE Multisig End-to-End Integration", () => {
  let client: SuiClient;
  let keypair: Ed25519Keypair;
  let counterId: string;

  beforeAll(async () => {
    client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
    const primeKeyInfo = getKeypair("PRIME");
    keypair = primeKeyInfo.keypair;
  });

  test("Step 1: creates SEAL IBE multisig counter with real Seal Key Server public keys", async () => {
    counterId = await createSealIbeMultisigCounter(client, keypair);

    // Verify counter was created with correct format
    expect(counterId).toMatch(/^0x[a-f0-9]{64}$/);

    // Verify initial counter value is 0
    const initialValue = await getCounterValue(client, counterId);
    expect(initialValue).toBe(0);
  }, 15000);

  test("Step 2: generates SEAL IBE signature with threshold IBE keys", async () => {
    if (!counterId) throw new Error("Counter not created - run Step 1 first");

    const message = "test-msg";
    const result = await generateSealIbeSignature(client, counterId, keypair, message);

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

    const message = "verify-msg";
    const { signature, keyServerIds } = await generateSealIbeSignature(
      client,
      counterId,
      keypair,
      message,
    );

    // This should not throw an error if verification succeeds
    const digest = await verifySignatureAndCreateProof(
      client,
      counterId,
      keypair,
      signature,
      message,
      keyServerIds,
    );

    // Wait for transaction to be processed
    await client.waitForTransaction({ digest });
  }, 15000);

  test("Step 4: increments counter with verified signature", async () => {
    if (!counterId) throw new Error("Counter not created - run Step 1 first");

    const initialValue = await getCounterValue(client, counterId);
    const message = "incr-msg";

    const { signature, keyServerIds } = await generateSealIbeSignature(
      client,
      counterId,
      keypair,
      message,
    );

    const digest = await verifySignatureAndCreateProof(
      client,
      counterId,
      keypair,
      signature,
      message,
      keyServerIds,
    );

    // Wait for transaction to be processed
    await client.waitForTransaction({ digest });

    // Verify counter was incremented
    const finalValue = await getCounterValue(client, counterId);
    expect(finalValue).toBe(initialValue + 1);
  }, 15000);

  test("Integration: completes full SEAL IBE multisig flow (create → sign → verify → increment)", async () => {
    // Create new counter for clean integration test
    const integrationCounterId = await createSealIbeMultisigCounter(client, keypair);

    if (!integrationCounterId) {
      throw new Error("Failed to create integration counter - got undefined");
    }

    // Verify initial state
    const initialValue = await getCounterValue(client, integrationCounterId);
    expect(initialValue).toBe(0);

    // Generate signature
    const message = "integ-msg";
    const { signature, keyServerIds } = await generateSealIbeSignature(
      client,
      integrationCounterId,
      keypair,
      message,
    );

    // Verify and increment in one transaction
    const digest = await verifySignatureAndCreateProof(
      client,
      integrationCounterId,
      keypair,
      signature,
      message,
      keyServerIds,
    );

    // Wait for transaction to be processed
    await client.waitForTransaction({ digest });

    // Verify final state
    const finalValue = await getCounterValue(client, integrationCounterId);
    expect(finalValue).toBe(1);
  }, 15000);
});
