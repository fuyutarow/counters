/**
 * HTTP-based Walrus client for Next.js
 * Uses the Walrus HTTP API directly to avoid WASM build issues
 */

import { z } from "zod";

// Using Mysten's public aggregator and publisher
// See: https://docs.walrus.site/usage/web-api.html
const AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space";
const PUBLISHER_URL = "https://publisher.walrus-testnet.walrus.space";

const walrusStoreResponseSchema = z.union([
  z.object({
    newlyCreated: z.object({
      blobObject: z.object({
        id: z.string(),
        storedEpoch: z.number(),
        blobId: z.string(),
        size: z.number(),
        erasureCodeType: z.string(),
        certifiedEpoch: z.number(),
        storage: z.object({
          id: z.string(),
          startEpoch: z.number(),
          endEpoch: z.number(),
          storageSize: z.number(),
        }),
      }),
      encodedSize: z.number(),
      cost: z.number(),
    }),
  }),
  z.object({
    alreadyCertified: z.object({
      blobId: z.string(),
      event: z.object({
        txDigest: z.string(),
        eventSeq: z.string(),
      }),
      endEpoch: z.number(),
    }),
  }),
]);

/**
 * Counter value stored in Walrus blob
 */
const walrusCounterValueSchema = z.object({
  value: z.number(),
});

export type WalrusCounterValue = z.infer<typeof walrusCounterValueSchema>;

/**
 * Store data on Walrus
 */
export async function storeBlob(data: Uint8Array | string): Promise<string> {
  // TypeScript型定義の問題:
  // - Uint8Array.bufferの型は ArrayBufferLike (= ArrayBuffer | SharedArrayBuffer)
  // - BodyInitが期待するのは ArrayBufferView<ArrayBuffer> | ArrayBuffer
  // - ArrayBufferLikeとArrayBufferは名目型の違いで互換性がない
  // - 実行時は動作するため、型アサーションで対応
  const body = (typeof data === "string" ? data : data.buffer) as BodyInit;

  const response = await fetch(`${PUBLISHER_URL}/v1/store`, {
    method: "PUT",
    body,
    headers: {
      "Content-Type": "application/octet-stream",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to store blob: ${response.statusText}`);
  }

  const json = await response.json();
  const parseResult = walrusStoreResponseSchema.safeParse(json);

  if (!parseResult.success) {
    throw new Error(`Invalid Walrus response: ${parseResult.error.message}`);
  }

  const result = parseResult.data;

  const blobId =
    "newlyCreated" in result
      ? result.newlyCreated.blobObject.blobId
      : result.alreadyCertified.blobId;

  return blobId;
}

/**
 * Read data from Walrus
 */
export async function readBlob(blobId: string): Promise<Uint8Array> {
  const response = await fetch(`${AGGREGATOR_URL}/v1/${blobId}`);

  if (!response.ok) {
    throw new Error(`Failed to read blob: ${response.statusText}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Read text data from Walrus
 */
export async function readBlobAsText(blobId: string): Promise<string> {
  const data = await readBlob(blobId);
  return new TextDecoder().decode(data);
}

/**
 * Read counter value from Walrus blob
 */
export async function readCounterValue(blobId: string): Promise<number> {
  const text = await readBlobAsText(blobId);
  const json = JSON.parse(text);
  const parseResult = walrusCounterValueSchema.safeParse(json);

  if (!parseResult.success) {
    throw new Error(`Invalid counter value: ${parseResult.error.message}`);
  }

  return parseResult.data.value;
}

/**
 * Create counter value blob in Walrus
 */
export async function createCounterBlob(value: number): Promise<string> {
  const counterData: WalrusCounterValue = { value };
  const blob = JSON.stringify(counterData);
  return await storeBlob(blob);
}
