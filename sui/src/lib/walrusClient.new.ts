/**
 * Walrus client using official @mysten/walrus SDK
 *
 * This is the recommended way to interact with Walrus.
 * The HTTP Publisher API is only for testing and incomplete.
 */

import { bcs } from "@mysten/sui/bcs";
import { type Signer } from "@mysten/sui/cryptography";
import { WalrusClient } from "@mysten/walrus";

// Initialize Walrus client for testnet
export function createWalrusClient() {
  return new WalrusClient({
    network: "testnet",
    suiRpcUrl: "https://fullnode.testnet.sui.io",
  });
}

/**
 * Counter value stored in Walrus blob
 */
const CounterValueBcs = bcs.struct("CounterValue", {
  value: bcs.u64(),
});

export type WalrusCounterValueInput = typeof CounterValueBcs.$inferInput;
export type WalrusCounterValue = typeof CounterValueBcs.$inferType;

/**
 * Store data on Walrus using official SDK
 */
export async function storeBlob(
  client: WalrusClient,
  data: Uint8Array,
  options: {
    signer: Signer;
    epochs?: number;
    deletable?: boolean;
  },
): Promise<{ blobId: string; blobObjectId: string }> {
  const result = await client.writeBlob({
    blob: data,
    epochs: options.epochs ?? 5,
    deletable: options.deletable ?? true,
    signer: options.signer,
  });

  return {
    blobId: result.blobId,
    blobObjectId: result.blobObject.id.id,
  };
}

/**
 * Read data from Walrus using official SDK
 */
export async function readBlob(client: WalrusClient, blobId: string): Promise<Uint8Array> {
  return await client.readBlob({ blobId });
}

/**
 * Read counter value from Walrus blob (BCS encoded)
 */
export async function readCounterValue(client: WalrusClient, blobId: string): Promise<bigint> {
  const bcsBytes = await readBlob(client, blobId);
  const data = CounterValueBcs.parse(bcsBytes);
  return BigInt(data.value);
}

/**
 * Create counter value blob in Walrus (BCS encoded)
 */
export async function createCounterBlob(
  client: WalrusClient,
  value: WalrusCounterValueInput["value"],
  options: {
    signer: Signer;
    epochs?: number;
  },
): Promise<{ blobId: string; blobObjectId: string }> {
  const bcsBytes = CounterValueBcs.serialize({ value }).toBytes();
  return await storeBlob(client, bcsBytes, {
    signer: options.signer,
    epochs: options.epochs ?? 5,
    deletable: true,
  });
}
