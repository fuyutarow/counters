/**
 * Multi-IBS Counter Onchain Integration Test
 *
 * Direct suigen API usage without unnecessary abstraction layers.
 * Follows viem-style functional patterns.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { type Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { bls12_381 } from "@noble/curves/bls12-381.js";
import { counterPackage, type Multi_ibs_counterMultiIBSCounterType } from "@/abi";
import { getKeypair } from "./utils/keybook.js";

// Configuration
const NETWORK = "testnet";
const THRESHOLD = 2;
const blss = bls12_381.shortSignatures;

// Real Key Server IDs from testnet
const KEY_SERVER_IDS = [
  "0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2",
  "0x6068c0acb197dddbacd4746a9de7f025b2ed5a5b6c1b1ab44dade4426d141da2",
  "0x5466b7df5c15b508678d51496ada8afab0d6f70a01c10613123382b1b8131007",
];

// Pure functions - no classes
const createMultiIBSCounter = async (
  client: SuiClient,
  keypair: Ed25519Keypair,
  keyServerIds: string[],
  threshold: number,
) => {
  const tx = new Transaction();

  counterPackage.multi_ibs_counter.share(tx, {
    arguments: [tx.pure.vector("address", keyServerIds), tx.pure.u64(threshold)],
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

const generateMockSecretKeyShares = (identity: string, count: number) => {
  const shares: Array<{ serverIndex: number; secretKey: Uint8Array; serverId: string }> = [];

  for (let i = 0; i < count; i++) {
    const seed = new TextEncoder().encode(`${identity}:${i}:server_${i}`);
    const secretKey = new Uint8Array(32);

    for (let j = 0; j < 32; j++) {
      secretKey[j] = seed[j % seed.length] ^ ((i * 17 + j * 31) & 0xff);
    }

    shares.push({
      serverIndex: i,
      secretKey,
      serverId: KEY_SERVER_IDS[i],
    });
  }

  return shares;
};

const aggregateSecretKeys = (shares: Array<{ secretKey: Uint8Array }>): Uint8Array => {
  if (shares.length === 0) {
    throw new Error("No secret key shares to aggregate");
  }

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

  let aggregated = bytesToBigInt(shares[0].secretKey);
  for (let i = 1; i < shares.length; i++) {
    const keyBigInt = bytesToBigInt(shares[i].secretKey);
    aggregated = (aggregated + keyBigInt) % bls12_381.fields.Fr.ORDER;
  }

  return bigIntToBytes(aggregated, 32);
};

const createBLSSignature = (secretKey: Uint8Array, message: string): Uint8Array => {
  const messageBytes = new TextEncoder().encode(message);
  const messageWithDomain = new Uint8Array([
    ...new TextEncoder().encode("SUI-MULTI-IBS-V1"),
    ...messageBytes,
  ]);
  const DST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";
  const hashedMessage = blss.hash(messageWithDomain, DST);
  const signature = blss.sign(hashedMessage, secretKey);
  return signature.toBytes();
};

describe("Multi-IBS Counter - Direct suigen API", () => {
  let client: SuiClient;
  let keypair: Ed25519Keypair;
  let counterId: string;

  beforeAll(async () => {
    client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
    const primeKeyInfo = getKeypair("PRIME");
    keypair = primeKeyInfo.keypair;
  });

  test("creates Multi-IBS counter", async () => {
    counterId = await createMultiIBSCounter(
      client,
      keypair,
      KEY_SERVER_IDS.slice(0, THRESHOLD + 1),
      THRESHOLD,
    );

    expect(counterId).toMatch(/^0x[a-f0-9]{64}$/);

    // Wait for object to be finalized
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const initialValue = await getCounterValue(client, counterId);
    expect(initialValue).toBe(0);
  });

  test.skip("increments counter with BLS signature - REQUIRES KEY SERVER OWNER ACCESS", async () => {
    /*
     * LIMITATION: Cannot access Key Server objects owned by:
     * 0x13cdcfab1a3db17a9723c165fefa68d44066f8f846b06c8045d6c86353b7c2b0
     *
     * Key Server type: 0x73bba649fe918ef501e2fb6ab82e83450a4c286f52cf3399e678e6da257f0c50::key_server::KeyServer
     */
    if (!counterId) throw new Error("Counter ID not available");

    const identity = keypair.getPublicKey().toSuiAddress();
    const message = `increment-test-${Date.now()}`;

    // BLS signature generation works
    const keyShares = generateMockSecretKeyShares(identity, 2);
    const aggregatedSK = aggregateSecretKeys(keyShares);
    const signature = createBLSSignature(aggregatedSK, message);

    expect(signature).toHaveLength(48);

    // Would require Key Server integration:
    // 1. new_aggregated_public_key
    // 2. add_key_server_public_key (x threshold)
    // 3. verify_and_create_proof
    // 4. increment
    // 5. destroy_aggregated_public_key
  });

  test(
    "threshold-1 counter with PTB component test",
    async () => {
      // Create threshold-1 counter with dummy Key Server
      const dummyKeyServerId = "0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2";
      const oneThresholdCounterId = await createMultiIBSCounter(
        client,
        keypair,
        [dummyKeyServerId], // Single Key Server array
        1, // Threshold 1
      );

      expect(oneThresholdCounterId).toMatch(/^0x[a-f0-9]{64}$/);

      // Wait for object to be finalized
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const initialValue = await getCounterValue(client, oneThresholdCounterId);
      expect(initialValue).toBe(0);

      // Test PTB component functions (without full execution due to Key Server requirements)
      const tx = new Transaction();

      // 1. new_aggregated_public_key - should work
      const [aggregatedKey] = counterPackage.multi_ibs_counter.new_aggregated_public_key(tx, {
        arguments: [tx.object(oneThresholdCounterId)],
      });

      // 2. destroy_aggregated_public_key - should work
      counterPackage.multi_ibs_counter.destroy_aggregated_public_key(tx, {
        arguments: [aggregatedKey],
      });

      // Execute limited PTB (without Key Server operations)
      const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: { showEffects: true, showObjectChanges: true },
      });

      expect(result.effects?.status?.status).toBe("success");

      // Counter value should remain 0 (no increment performed)
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const finalValue = await getCounterValue(client, oneThresholdCounterId);
      expect(finalValue).toBe(0);
    },
    { timeout: 15000 },
  );
});
