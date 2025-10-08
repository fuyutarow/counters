/**
 * Walrus Counter Node.js Test
 *
 * Tests the complete flow of creating and updating a Walrus counter.
 */

import { before, describe, it } from "node:test";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import * as walrusCounter from "@/generated/counter/walrus_counter";
import { createCounterBlob, readCounterValue } from "@/lib/walrusClient";
import { networkConfig } from "@/networkConfig";
import { getCarol, type KeyInfo } from "./utils/keybook";

const COUNTER_PACKAGE_ID = networkConfig.testnet.variables.counterPackageId;

describe("Walrus Counter", { timeout: 60000 }, () => {
  let client: SuiClient;
  let keyInfo: KeyInfo;

  before(async () => {
    client = new SuiClient({ url: getFullnodeUrl("testnet") });
    keyInfo = getCarol();
  });

  it("should create a Walrus counter", async () => {
    const signerAddress = keyInfo.keypair.toSuiAddress();
    const blobObjectId = await createCounterBlob(0, signerAddress);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const _blobObject = await client.getObject({
      id: blobObjectId,
      options: { showOwner: true, showType: true, showContent: true },
    });
    const tx = new Transaction();
    const counter = walrusCounter._new({
      package: COUNTER_PACKAGE_ID,
      arguments: [tx.object(blobObjectId)],
    })(tx);

    tx.transferObjects([counter], signerAddress);
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

  it.skip("should read counter value from Walrus blob", async () => {
    // This test needs to be updated to use the blob ID from the blob object
    // Currently createCounterBlob returns object ID, not blob ID
    const blobId = await createCounterBlob(42);
    const value = await readCounterValue(blobId);

    if (value !== 42n) {
      throw new Error(`Expected 42n, got ${value}`);
    }
  }, 30000);
});
