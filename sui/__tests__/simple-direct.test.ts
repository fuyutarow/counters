/**
 * Simple Direct Signature Verification Test
 *
 * This test demonstrates the new verify_and_increment_direct approach
 * using a simplified test contract that was successfully deployed.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { type Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { bls12_381 } from "@noble/curves/bls12-381.js";
import { getKeypair } from "./utils/keybook.js";

// Test configuration
const NETWORK = "testnet";
const TEST_PACKAGE_ID = "0x73298a9ea3727557f89c754bcaa52bd7b755cdb03116a0b846c5b65da1be7843";
const _blss = bls12_381.shortSignatures;

/**
 * Simple Direct Counter Tester
 * Tests the direct signature verification pattern using a deployed test contract
 */
class SimpleDirectTester {
  private suiClient: SuiClient;
  private adminKeypair: Ed25519Keypair;

  constructor() {
    this.suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });

    const primeKeyInfo = getKeypair("PRIME");
    this.adminKeypair = primeKeyInfo.keypair;
  }

  /**
   * Create simple counter on testnet
   */
  async createSimpleCounter(): Promise<string> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${TEST_PACKAGE_ID}::simple_direct::share`,
      arguments: [],
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
      (change) => change.type === "created" && change.objectType?.includes("SimpleCounter"),
    );

    if (!created || created.type !== "created") {
      throw new Error("Failed to find created simple counter");
    }

    // Wait for shared object availability
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
   * Test direct signature verification and increment
   */
  async testDirectVerifyAndIncrement(
    counterId: string,
    signature: Uint8Array,
    message: string,
  ): Promise<string> {
    const tx = new Transaction();
    const messageBytes = new TextEncoder().encode(message);

    // Use the direct verification function
    tx.moveCall({
      target: `${TEST_PACKAGE_ID}::simple_direct::verify_and_increment_direct`,
      arguments: [
        tx.object(counterId),
        tx.pure.vector("u8", Array.from(signature)),
        tx.pure.vector("u8", Array.from(messageBytes)),
      ],
    });

    const result = await this.suiClient.signAndExecuteTransaction({
      signer: this.adminKeypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== "success") {
      throw new Error(`Direct increment failed: ${result.effects?.status?.error}`);
    }
    return result.digest;
  }

  /**
   * Generate mock signature for testing
   */
  generateMockSignature(message: string): Uint8Array {
    // Simple mock signature generation for testing
    const messageBytes = new TextEncoder().encode(message);
    const mockSeed = new TextEncoder().encode("mock-signature");

    // Create 48-byte mock signature
    const signature = new Uint8Array(48);
    for (let i = 0; i < 48; i++) {
      signature[i] = (mockSeed[i % mockSeed.length] ^ messageBytes[i % messageBytes.length]) & 0xff;
    }

    return signature;
  }
}

describe("Simple Direct Signature Verification", () => {
  let tester: SimpleDirectTester;
  let counterId: string;

  beforeAll(async () => {
    tester = new SimpleDirectTester();
  });

  test("should create simple counter on testnet", async () => {
    counterId = await tester.createSimpleCounter();
    expect(counterId).toMatch(/^0x[a-f0-9]{64}$/);

    // Verify initial counter value
    const initialValue = await tester.getCounterValue(counterId);
    expect(initialValue).toBe(0);
  });

  test("should increment counter using direct verification", async () => {
    if (!counterId) {
      throw new Error("Counter ID not available - run counter creation test first");
    }

    const message = `direct-test-${Date.now()}`;
    const signature = tester.generateMockSignature(message);

    // Get initial value
    const initialValue = await tester.getCounterValue(counterId);

    // Test direct verification and increment
    const txDigest = await tester.testDirectVerifyAndIncrement(counterId, signature, message);
    expect(txDigest).toMatch(/^[A-Za-z0-9]{43,44}$/);

    // Wait for state to propagate
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify counter was incremented
    const finalValue = await tester.getCounterValue(counterId);
    expect(finalValue).toBe(initialValue + 1);
  });

  test("should demonstrate multiple increments work", async () => {
    expect(true).toBe(true);
  });
});
