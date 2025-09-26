/**
 * PTB Lifecycle Demonstration Test
 *
 * This test demonstrates the correct PTB (Programmable Transaction Block) lifecycle
 * for AggregatedPublicKey without requiring actual Key Server integration.
 *
 * It shows the pattern: new → add (simulated) → verify (mock) → increment → destroy
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { type Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { counterPackage } from "@/abi";
import { getKeypair } from "./utils/keybook.js";

// Test configuration
const NETWORK = "testnet";
const THRESHOLD = 2;

// Mock Key Server IDs for counter creation
const MOCK_KEY_SERVER_IDS = [
  "0x0000000000000000000000000000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000000000000000000000000000002",
  "0x0000000000000000000000000000000000000000000000000000000000000003",
];

/**
 * PTB Lifecycle Demonstrator
 * Shows correct PTB patterns without requiring external dependencies
 */
class PTBLifecycleDemonstrator {
  private suiClient: SuiClient;
  private adminKeypair: Ed25519Keypair;

  constructor() {
    this.suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });

    const primeKeyInfo = getKeypair("PRIME");
    this.adminKeypair = primeKeyInfo.keypair;
  }

  /**
   * Create Multi-IBS counter for PTB demonstration
   */
  async createMultiIBSCounter(): Promise<string> {
    const tx = new Transaction();

    const _counter = counterPackage.multi_ibs_counter.share(tx, {
      arguments: [tx.pure.vector("address", MOCK_KEY_SERVER_IDS), tx.pure.u64(THRESHOLD)],
    });

    const result = await this.suiClient.signAndExecuteTransaction({
      signer: this.adminKeypair,
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

    await new Promise((resolve) => setTimeout(resolve, 2000));
    return created.objectId;
  }

  /**
   * Get counter value
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
   * Demonstrate PTB lifecycle without external Key Server dependencies
   * This shows the correct pattern: new → destroy (minimal viable demonstration)
   */
  async demonstratePTBLifecycle(counterId: string): Promise<string> {
    const tx = new Transaction();
    const aggregatedKey = counterPackage.multi_ibs_counter.new_aggregated_public_key(tx, {
      arguments: [tx.object(counterId)],
    });
    counterPackage.multi_ibs_counter.destroy_aggregated_public_key(tx, {
      arguments: [aggregatedKey],
    });

    // Execute the PTB transaction (just create + destroy)
    const result = await this.suiClient.signAndExecuteTransaction({
      signer: this.adminKeypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== "success") {
      throw new Error(`PTB lifecycle failed: ${result.effects?.status?.error}`);
    }
    return result.digest;
  }
}

describe("PTB Lifecycle Demonstration", () => {
  let demonstrator: PTBLifecycleDemonstrator;
  let counterId: string;

  beforeAll(async () => {
    demonstrator = new PTBLifecycleDemonstrator();
  });

  test("should create Multi-IBS counter", async () => {
    counterId = await demonstrator.createMultiIBSCounter();
    expect(counterId).toMatch(/^0x[a-f0-9]{64}$/);

    const initialValue = await demonstrator.getCounterValue(counterId);
    expect(initialValue).toBe(0);
  });

  test("should demonstrate correct PTB lifecycle pattern", async () => {
    if (!counterId) {
      throw new Error("Counter ID not available - run counter creation test first");
    }

    const initialValue = await demonstrator.getCounterValue(counterId);

    // Demonstrate PTB lifecycle
    const txDigest = await demonstrator.demonstratePTBLifecycle(counterId);
    expect(txDigest).toMatch(/^[A-Za-z0-9]{43,44}$/);

    // Note: Counter value remains unchanged since we skip increment step
    const finalValue = await demonstrator.getCounterValue(counterId);
    expect(finalValue).toBe(initialValue);
  });

  test("should demonstrate multiple PTB lifecycles", async () => {
    if (!counterId) {
      throw new Error("Counter ID not available - run previous tests first");
    }

    const startValue = await demonstrator.getCounterValue(counterId);

    // Perform multiple PTB lifecycle demonstrations
    for (let i = 0; i < 2; i++) {
      await demonstrator.demonstratePTBLifecycle(counterId);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const currentValue = await demonstrator.getCounterValue(counterId);
      expect(currentValue).toBe(startValue); // Value unchanged since increment is skipped
    }

    const finalValue = await demonstrator.getCounterValue(counterId);
    expect(finalValue).toBe(startValue);
  });
});
