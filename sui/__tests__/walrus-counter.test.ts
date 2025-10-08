/**
 * Walrus Counter Node.js Test
 *
 * Tests the complete flow of creating and updating a Walrus counter.
 */

import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { z } from "zod";
import * as walrusCounter from "@/generated/counter/walrus_counter";
import {
  createCounterBlob,
  getBlobIdFromObject,
  incrementWalrusCounter,
  readBlob,
  readCounterValue,
  storeBlob,
} from "@/lib/walrusClient";
import { networkConfig } from "@/networkConfig";
import { getCarol, type KeyInfo } from "./utils/keybook";

const COUNTER_PACKAGE_ID = networkConfig.testnet.variables.counterPackageId;

const blobObjectSchema = z.object({
  data: z.object({
    content: z.object({
      dataType: z.literal("moveObject"),
      fields: z.object({
        id: z.object({ id: z.string() }),
        blob_id: z.union([z.string(), z.number()]), // Can be either string or number
      }),
    }),
  }),
});

const _walrusCounterSchema = z.object({
  data: z.object({
    content: z.object({
      dataType: z.literal("moveObject"),
      fields: z.object({
        id: z.object({ id: z.string() }),
        blob: z.object({
          fields: z.object({
            id: z.object({ id: z.string() }),
            blob_id: z.union([z.string(), z.number()]),
          }),
        }),
      }),
    }),
  }),
});

describe("Walrus Counter", { timeout: 60000 }, () => {
  let client: SuiClient;
  let keyInfo: KeyInfo;

  before(async () => {
    client = new SuiClient({ url: getFullnodeUrl("testnet") });
    keyInfo = getCarol();
  });

  it("should store and read blob data", { timeout: 30000 }, async () => {
    const testData = new TextEncoder().encode("Hello Walrus!");
    const signerAddress = keyInfo.keypair.toSuiAddress();

    // Store blob
    const blobObjectId = await storeBlob(testData, signerAddress);
    assert.ok(blobObjectId, "Should return blob object ID");

    // Wait for blob object to be created and propagated to aggregators
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Get blob ID from blob object
    const blobId = await getBlobIdFromObject(client, blobObjectId);
    assert.ok(blobId, "Should have blob_id");

    // Read blob
    const retrievedData = await readBlob(blobId);
    assert.deepStrictEqual(retrievedData, testData, "Retrieved data should match original");
  });

  it("should create and read counter blob with BCS encoding", { timeout: 60000 }, async () => {
    const testValue = 42;
    const signerAddress = keyInfo.keypair.toSuiAddress();

    // Create counter blob
    const blobObjectId = await createCounterBlob(testValue, signerAddress);
    assert.ok(blobObjectId, "Should return blob object ID");

    // Wait for blob object to be created and propagated to aggregators
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Get blob object to extract blob_id
    const blobObject = await client.getObject({
      id: blobObjectId,
      options: { showContent: true },
    });

    const parseResult = blobObjectSchema.safeParse(blobObject);
    assert.ok(parseResult.success, "Should have valid blob object structure");

    const blobId = await getBlobIdFromObject(client, blobObjectId);

    // Read counter value
    const value = await readCounterValue(blobId);
    assert.strictEqual(value, BigInt(testValue), "Counter value should match");
  });

  it("should create a Walrus counter", { timeout: 60000 }, async () => {
    const signerAddress = keyInfo.keypair.toSuiAddress();
    const blobObjectId = await createCounterBlob(0, signerAddress);
    await new Promise((resolve) => setTimeout(resolve, 15000));
    const _blobObject = await client.getObject({
      id: blobObjectId,
      options: { showOwner: true, showType: true, showContent: true },
    });
    const tx = new Transaction();
    const [counter] = walrusCounter._new({
      package: COUNTER_PACKAGE_ID,
      arguments: [tx.object(blobObjectId)],
    })(tx);

    tx.transferObjects([counter], signerAddress);
    tx.setGasBudget(10000000);

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: keyInfo.keypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    if (result.effects?.status.status !== "success") {
      const error = `Transaction failed: ${result.effects?.status.error || "Unknown error"}`;
      throw new Error(error);
    }

    const createdObject = result.effects?.created?.[0];
    if (!createdObject?.reference?.objectId) {
      const error = "Failed to get created object ID";
      throw new Error(error);
    }
  });

  it(
    "should create, increment, and read counter through full lifecycle",
    { timeout: 120000 },
    async () => {
      const signerAddress = keyInfo.keypair.toSuiAddress();

      // 1. Create initial blob with value 0
      const initialBlobObjectId = await createCounterBlob(0, signerAddress);
      await new Promise((resolve) => setTimeout(resolve, 15000));

      // 2. Create counter with initial blob
      const tx1 = new Transaction();
      const [counter] = walrusCounter._new({
        package: COUNTER_PACKAGE_ID,
        arguments: [tx1.object(initialBlobObjectId)],
      })(tx1);
      tx1.transferObjects([counter], signerAddress);
      tx1.setGasBudget(10000000);

      const createResult = await client.signAndExecuteTransaction({
        transaction: tx1,
        signer: keyInfo.keypair,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      assert.strictEqual(
        createResult.effects?.status.status,
        "success",
        "Counter creation should succeed",
      );

      const createdCounterObj = createResult.effects?.created?.find(
        (obj) =>
          obj.owner === "Shared" || (typeof obj.owner === "object" && "AddressOwner" in obj.owner),
      );
      assert.ok(createdCounterObj?.reference?.objectId, "Should have created counter object");

      const counterId = createdCounterObj.reference.objectId;

      // 3. Read initial value before increment
      const initialBlobId = await getBlobIdFromObject(client, initialBlobObjectId);
      const _initialRawBytes = await readBlob(initialBlobId);
      const initialValue = await readCounterValue(initialBlobId);
      assert.strictEqual(initialValue, 0n, "Initial value should be 0");

      // 4. Increment counter using helper function
      const newBlobObjectId = await incrementWalrusCounter(
        client,
        counterId,
        initialBlobObjectId,
        signerAddress,
      );
      await new Promise((resolve) => setTimeout(resolve, 15000));

      const tx2 = new Transaction();
      const [oldBlob] = walrusCounter.replace({
        package: COUNTER_PACKAGE_ID,
        arguments: [tx2.object(counterId), tx2.object(newBlobObjectId)],
      })(tx2);
      tx2.transferObjects([oldBlob], signerAddress);
      tx2.setGasBudget(10000000);

      const replaceResult = await client.signAndExecuteTransaction({
        transaction: tx2,
        signer: keyInfo.keypair,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      if (replaceResult.effects?.status.status !== "success") {
      }
      assert.strictEqual(
        replaceResult.effects?.status.status,
        "success",
        `Counter replace should succeed: ${replaceResult.effects?.status.error}`,
      );

      // 4. Verify increment worked correctly by parsing the new blob
      const newBlobId = await getBlobIdFromObject(client, newBlobObjectId);

      // 4a. Read raw bytes from new blob
      const newRawBytes = await readBlob(newBlobId);

      // 4b. Read raw bytes from initial blob
      const initialRawBytes = await readBlob(initialBlobId);

      // 4c. Parse both with BCS
      const newBlobValue = await readCounterValue(newBlobId);

      // 4e. Verify increment: 0 → 1
      assert.strictEqual(initialValue, 0n, "Initial value: 0");
      assert.strictEqual(newBlobValue, 1n, "New value: 1");
      assert.strictEqual(newBlobValue - initialValue, 1n, "Increment: +1");
      assert.strictEqual(initialRawBytes.length, 8, "BCS u64 should be 8 bytes");
      assert.strictEqual(newRawBytes.length, 8, "BCS u64 should be 8 bytes");
    },
  );
});
