/**
 * Simple Walrus HTTP API client
 * Based on official documentation: https://docs.wal.app/usage/web-api.html
 */

import { bcs } from "@mysten/sui/bcs";

const AGGREGATOR_URL = "https://testnet-aggregator.walrus.graphyte.dev/v1";
const PUBLISHER_URL = "https://testnet-publisher.walrus.graphyte.dev/v1";

/**
 * Store blob using HTTP Publisher API
 * @returns blob ID (base64url format)
 */
export async function storeBlob(data: Uint8Array | string, epochs = 5): Promise<string> {
  const body = typeof data === "string" ? data : data.buffer;
  const url = `${PUBLISHER_URL}/blobs?epochs=${epochs}`;

  const response = await fetch(url, {
    method: "PUT",
    body: body as BodyInit,
    headers: { "Content-Type": "application/octet-stream" },
  });

  if (!response.ok) {
    throw new Error(`Failed to store blob: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  // Extract blob ID from response
  if (result.newlyCreated) {
    return result.newlyCreated.blobObject.blobId;
  }
  if (result.alreadyCertified) {
    return result.alreadyCertified.blobId;
  }

  throw new Error("Unexpected response format");
}

/**
 * Read blob using HTTP Aggregator API
 */
export async function readBlob(blobId: string): Promise<Uint8Array> {
  const url = `${AGGREGATOR_URL}/blobs/${blobId}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to read blob: ${response.status} ${response.statusText}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

// Counter value BCS schema
const CounterValueBcs = bcs.struct("CounterValue", {
  value: bcs.u64(),
});

export type CounterValueInput = typeof CounterValueBcs.$inferInput;
export type CounterValue = typeof CounterValueBcs.$inferType;

/**
 * Store counter value as BCS-encoded blob
 */
export async function storeCounterValue(
  value: CounterValueInput["value"],
  epochs = 5,
): Promise<string> {
  const bcsBytes = CounterValueBcs.serialize({ value }).toBytes();
  return await storeBlob(bcsBytes, epochs);
}

/**
 * Read counter value from BCS-encoded blob
 */
export async function readCounterValue(blobId: string): Promise<bigint> {
  const bcsBytes = await readBlob(blobId);
  const data = CounterValueBcs.parse(bcsBytes);
  return BigInt(data.value);
}
