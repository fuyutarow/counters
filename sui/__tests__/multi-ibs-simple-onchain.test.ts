/**
 * Simplified Multi-IBS Counter Onchain Test
 *
 * This test focuses on the basic onchain counter functionality:
 * 1. Creating Multi-IBS counter on testnet
 * 2. Checking counter values
 * 3. Using test functions to bypass complex signature verification
 *
 * This demonstrates the onchain infrastructure works correctly
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { type Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { counterPackage } from "@/abi";
import { getKeypair } from "./utils/keybook.js";

// Test configuration
const NETWORK = "testnet";
const THRESHOLD = 2; // 2-of-3 threshold

// Key Server configurations for testing
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

/**
 * Simple Multi-IBS Counter Tester
 */
class SimpleMultiIBSTester {
  private suiClient: SuiClient;
  private adminKeypair: Ed25519Keypair;

  constructor() {
    this.suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });

    // Use funded keypair from Sui CLI keystore
    const primeKeyInfo = getKeypair("PRIME");
    this.adminKeypair = primeKeyInfo.keypair;
  }

  /**
   * Create Multi-IBS counter on testnet
   */
  async createMultiIBSCounter(): Promise<string> {
    const tx = new Transaction();

    // Create counter with Key Server IDs and threshold
    const keyServerIds = KEY_SERVERS.map((server) => server.objectId);
    const _counter = counterPackage.multi_ibs_counter.share(tx, {
      arguments: [tx.pure.vector("address", keyServerIds), tx.pure.u64(THRESHOLD)],
    });

    const result = await this.suiClient.signAndExecuteTransaction({
      signer: this.adminKeypair,
      transaction: tx,
      options: { showEffects: true, showObjectChanges: true },
    });

    if (result.effects?.status?.status !== "success") {
      throw new Error(`Counter creation failed: ${result.effects?.status?.error}`);
    }

    // Find the created counter object
    const created = result.objectChanges?.find(
      (change) => change.type === "created" && change.objectType?.includes("MultiIBSCounter"),
    );

    if (!created || created.type !== "created") {
      throw new Error("Failed to find created Multi-IBS counter");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return created.objectId;
  }

  /**
   * Get current counter value
   */
  async getCounterValue(counterId: string): Promise<number> {
    const counterObject = await this.suiClient.getObject({
      id: counterId,
      options: { showContent: true },
    });

    if (!counterObject.data?.content || counterObject.data.content.dataType !== "moveObject") {
      throw new Error("Failed to fetch counter object");
    }

    const fields = counterObject.data.content.fields as any;
    return Number(fields.value);
  }

  /**
   * Create a test counter that can be incremented directly (without signature verification)
   */
  async createTestCounter(): Promise<string> {
    const tx = new Transaction();

    const keyServerIds = KEY_SERVERS.map((server) => server.objectId);
    const testCounter = counterPackage.multi_ibs_counter.test_create_counter(tx, {
      arguments: [tx.pure.vector("address", keyServerIds), tx.pure.u64(THRESHOLD)],
    });

    // Transfer to sender for ownership
    tx.transferObjects([testCounter], this.adminKeypair.getPublicKey().toSuiAddress());

    const result = await this.suiClient.signAndExecuteTransaction({
      signer: this.adminKeypair,
      transaction: tx,
      options: { showEffects: true, showObjectChanges: true },
    });

    if (result.effects?.status?.status !== "success") {
      throw new Error(`Test counter creation failed: ${result.effects?.status?.error}`);
    }

    // Find the created counter object
    const created = result.objectChanges?.find(
      (change) => change.type === "created" && change.objectType?.includes("MultiIBSCounter"),
    );

    if (!created || created.type !== "created") {
      throw new Error("Failed to find created test counter");
    }
    return created.objectId;
  }

  /**
   * Create and use a test proof to increment counter
   */
  async testIncrementWithMockProof(counterId: string): Promise<string> {
    const tx = new Transaction();

    // Create a test proof that bypasses signature verification
    const testProof = counterPackage.multi_ibs_counter.test_create_proof(tx, {
      arguments: [
        tx.object(counterId),
        tx.pure.u64(2), // Mock verified signer count
      ],
    });

    // Use the test proof to increment counter
    counterPackage.multi_ibs_counter.increment(tx, {
      arguments: [tx.object(counterId), testProof],
    });

    const result = await this.suiClient.signAndExecuteTransaction({
      signer: this.adminKeypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== "success") {
      throw new Error(`Test increment failed: ${result.effects?.status?.error}`);
    }
    return result.digest;
  }
}

describe("Simple Multi-IBS Counter Onchain Test", () => {
  let tester: SimpleMultiIBSTester;
  let sharedCounterId: string;
  let testCounterId: string;

  beforeAll(async () => {
    tester = new SimpleMultiIBSTester();
  });

  test("should create shared Multi-IBS counter on testnet", async () => {
    sharedCounterId = await tester.createMultiIBSCounter();
    expect(sharedCounterId).toMatch(/^0x[a-f0-9]{64}$/);

    // Verify initial counter value
    const initialValue = await tester.getCounterValue(sharedCounterId);
    expect(initialValue).toBe(0);
  });

  test.skip("should create owned test counter", async () => {
    // Skipped: test_create_counter function is not available in deployed contract
    // (marked with #[test_only] in Move contract)
    testCounterId = await tester.createTestCounter();
    expect(testCounterId).toMatch(/^0x[a-f0-9]{64}$/);
  });

  test.skip("should increment counter using test proof", async () => {
    // Skipped: test_create_proof function is not available in deployed contract
    // (marked with #[test_only] in Move contract)
    if (!sharedCounterId) {
      throw new Error("Shared counter ID not available - run counter creation test first");
    }

    // Get initial value
    const initialValue = await tester.getCounterValue(sharedCounterId);

    // Increment using test proof
    const txDigest = await tester.testIncrementWithMockProof(sharedCounterId);
    expect(txDigest).toMatch(/^[A-Za-z0-9]{43,44}$/);

    // Verify counter was incremented
    const finalValue = await tester.getCounterValue(sharedCounterId);
    expect(finalValue).toBe(initialValue + 1);
  });

  test.skip("should increment counter multiple times", async () => {
    // Skipped: depends on test_create_proof which is not available in deployed contract
    // (marked with #[test_only] in Move contract)
    if (!sharedCounterId) {
      throw new Error("Counter ID not available - run previous tests first");
    }

    const startValue = await tester.getCounterValue(sharedCounterId);

    // Perform multiple increments
    for (let i = 0; i < 3; i++) {
      await tester.testIncrementWithMockProof(sharedCounterId);

      const currentValue = await tester.getCounterValue(sharedCounterId);
      expect(currentValue).toBe(startValue + i + 1);
    }

    const finalValue = await tester.getCounterValue(sharedCounterId);
    expect(finalValue).toBe(startValue + 3);
  });
});
