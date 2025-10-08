/**
 * Walrus client using official @mysten/walrus SDK
 */

import { bcs } from "@mysten/sui/bcs";
import { ResultAsync } from "neverthrow";
import { z } from "zod";

// Using Graphyte's public aggregator and publisher
// See: https://docs.walrus.site/usage/web-api.html
//
// NOTE: Public Walrus publishers provide free access but consume their own SUI/WAL tokens
// The publisher operator pays for storage, not the client
// Publishers may become unavailable when their token balance is depleted
// For production use, consider:
// - Running your own Walrus publisher node
// - Using Walrus CLI directly
// - Implementing fallback to multiple publishers
const AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space";
const PUBLISHER_URL = "https://publisher.walrus-testnet.walrus.space";

/**
 * Walrus HTTP APIのレスポンス型定義
 *
 * zodが必要な理由：
 * - @mysten/walrus SDKはWASMに依存しNext.jsビルドに失敗
 * - HTTP APIには公式TypeScript型定義が提供されていない
 * - 実行時の型安全性のため、zodでバリデーションを行う
 */
const walrusStoreResponseSchema = z.union([
  z.object({
    newlyCreated: z.object({
      blobObject: z.object({
        id: z.string(),
        registeredEpoch: z.number(),
        blobId: z.string(),
        size: z.number(),
        encodingType: z.string(),
        certifiedEpoch: z.number().nullable(),
        storage: z.object({
          id: z.string(),
          startEpoch: z.number(),
          endEpoch: z.number(),
          storageSize: z.number(),
        }),
        deletable: z.boolean(),
      }),
      resourceOperation: z.object({
        registerFromScratch: z.object({
          encodedLength: z.number(),
          epochsAhead: z.number(),
        }),
      }),
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
 *
 * Note: Move側に対応する構造体定義は不要
 * - Blobの中身は任意のバイト列として扱われる
 * - クライアント側で独自にBCSスキーマを定義して管理
 */
const CounterValueBcs = bcs.struct("CounterValue", {
  value: bcs.u64(),
});

/**
 * TypeScript型を自動推論
 *
 * ベストプラクティス:
 * - 手動でinterfaceを定義せず、BCSスキーマから型を導出
 * - Input型とOutput型を明示的に分離
 */
export type WalrusCounterValueInput = typeof CounterValueBcs.$inferInput;
// → { value: number | string | bigint }

export type WalrusCounterValue = typeof CounterValueBcs.$inferType;
// → { value: string }

/**
 * Store data on Walrus and return Sui Blob object ID
 *
 * @param data - Data to store (string or Uint8Array)
 * @param ownerAddress - Optional Sui address to send the Blob object to
 * @param epochs - Number of epochs to store (default: 5 = ~17 hours on testnet)
 * @returns Sui object ID of the created Blob object
 */
export async function storeBlob(
  data: Uint8Array | string,
  ownerAddress?: string,
  epochs = 5,
): Promise<string> {
  // TypeScript型定義の問題:
  // - Uint8Array.bufferの型は ArrayBufferLike (= ArrayBuffer | SharedArrayBuffer)
  // - BodyInitが期待するのは ArrayBufferView<ArrayBuffer> | ArrayBuffer
  // - ArrayBufferLikeとArrayBufferは名目型の違いで互換性がない
  // - 実行時は動作するため、型アサーションで対応
  const body = (typeof data === "string" ? data : data.buffer) as BodyInit;

  const url = new URL(`${PUBLISHER_URL}/v1/blobs`);
  url.searchParams.set("epochs", epochs.toString());
  if (ownerAddress) {
    url.searchParams.set("send_object_to", ownerAddress);
  }

  const response = await fetch(url.toString(), {
    method: "PUT",
    body,
    headers: {
      "Content-Type": "application/octet-stream",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to store blob: ${response.status} ${response.statusText}\n${errorText}`,
    );
  }

  const json = await response.json();
  const parseResult = walrusStoreResponseSchema.safeParse(json);

  if (!parseResult.success) {
    throw new Error(`Invalid Walrus response: ${parseResult.error.message}`);
  }

  const result = parseResult.data;

  // Return Sui Blob object ID (not Walrus blob ID)
  if ("newlyCreated" in result) {
    return result.newlyCreated.blobObject.id;
  }

  // For already certified blobs, we need to query the object ID from the event
  throw new Error("Blob already certified - need to implement event querying to get object ID");
}

/**
 * Read data from Walrus by blob ID
 *
 * @param blobId - Walrus blob ID (32-byte hex string)
 * @returns Raw blob data
 */
export async function readBlob(blobId: string): Promise<Uint8Array> {
  const url = `${AGGREGATOR_URL}/v1/blobs/${blobId}`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorMsg = `Failed to read blob from Walrus: ${response.status} ${response.statusText}`;
    throw new Error(errorMsg);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Convert u256 blob ID to base64url format
 *
 * Based on @mysten/walrus SDK implementation
 * @see https://github.com/mystenlabs/ts-sdks/blob/main/packages/walrus/src/utils/bcs.ts#L51-L59
 */
export function blobIdFromInt(blobId: bigint | string): string {
  return bcs
    .u256()
    .serialize(blobId)
    .toBase64()
    .replace(/=*$/, "") // Remove padding
    .replace(/\+/g, "-") // URL-safe
    .replace(/\//g, "_"); // URL-safe
}

/**
 * Get blob ID from Sui Blob object
 *
 * @param suiClient - Sui client instance
 * @param blobObjectId - Sui Blob object ID
 * @returns Walrus blob ID in base64url format
 */
export async function getBlobIdFromObject(
  suiClient: {
    getObject: (params: { id: string; options: { showContent: boolean } }) => Promise<unknown>;
  },
  blobObjectId: string,
): Promise<string> {
  const blobObjectSchema = z.object({
    data: z.object({
      content: z.object({
        dataType: z.literal("moveObject"),
        fields: z.object({
          blob_id: z.union([z.string(), z.number()]),
        }),
      }),
    }),
  });

  const blobObject = await suiClient.getObject({
    id: blobObjectId,
    options: { showContent: true },
  });

  const parseResult = blobObjectSchema.safeParse(blobObject);
  if (!parseResult.success) {
    throw new Error(`Invalid Blob object: ${parseResult.error.message}`);
  }

  const blobId = parseResult.data.data.content.fields.blob_id;

  // Already in base64url format if it contains letters
  if (typeof blobId === "string" && /[A-Za-z_-]/.test(blobId)) {
    return blobId;
  }

  // Convert u256 (stored as decimal string or number) to base64url
  return blobIdFromInt(typeof blobId === "number" ? BigInt(blobId) : blobId);
}

/**
 * Read counter value from Walrus blob (BCS encoded)
 *
 * @returns bigint (BCS u64の出力型)
 */
export async function readCounterValue(blobId: string): Promise<bigint> {
  const bcsBytes = await readBlob(blobId);
  const data = CounterValueBcs.parse(bcsBytes);
  // data.value は string型 (BCS u64の出力)
  return BigInt(data.value);
}

/**
 * Wait for blob to be available on aggregators with polling
 *
 * Better than fixed sleep: adapts to actual propagation time
 *
 * @param blobId - Blob ID to check
 * @param options - Polling options
 * @returns true when blob is available
 */
export async function waitForBlobAvailable(
  blobId: string,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    timeout?: number;
  } = {},
): Promise<boolean> {
  const { maxAttempts = 10, initialDelay = 1000, maxDelay = 5000, timeout = 30000 } = options;

  const startTime = Date.now();
  let attempt = 0;

  while (attempt < maxAttempts) {
    // Check timeout
    if (Date.now() - startTime > timeout) {
      throw new Error(`Timeout waiting for blob ${blobId} to be available on aggregators`);
    }

    // Try to read the blob using ResultAsync
    const readResult = await ResultAsync.fromPromise(readBlob(blobId), (e) => e);

    if (readResult.isOk()) {
      return true; // Success!
    }

    attempt++;

    // If this was the last attempt, throw
    if (attempt >= maxAttempts) {
      throw new Error(
        `Blob ${blobId} not available after ${maxAttempts} attempts. It may still be propagating to aggregators.`,
      );
    }

    // Exponential backoff: 1s, 2s, 4s, 5s (max), 5s, ...
    const delay = Math.min(initialDelay * 2 ** attempt, maxDelay);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return false;
}

/**
 * Create counter value blob in Walrus (BCS encoded)
 *
 * @param value - number | string | bigint (BCS u64の入力型)
 * @param ownerAddress - Optional Sui address to send the Blob object to
 * @returns Sui blob object ID
 */
export async function createCounterBlob(
  value: WalrusCounterValueInput["value"],
  ownerAddress?: string,
): Promise<string> {
  const bcsBytes = CounterValueBcs.serialize({ value }).toBytes();
  const blobObjectId = await storeBlob(bcsBytes, ownerAddress);
  return blobObjectId;
}

/**
 * Prepare increment for Walrus counter by reading current value and creating new blob
 *
 * NOTE: This only creates the new blob. Caller must execute replace() transaction separately:
 * 1. Call this function to get newBlobObjectId
 * 2. Execute walrusCounter.replace(tx, counterId, newBlobObjectId)
 * 3. Transfer old blob returned from replace()
 *
 * @param suiClient - Sui client instance
 * @param _counterObjectId - WalrusCounter object ID (unused, for future use)
 * @param currentBlobObjectId - Current blob object ID in the counter
 * @param signerAddress - Address to send the new blob object to
 * @returns New blob object ID (to be used with replace())
 */
export async function incrementWalrusCounter(
  suiClient: {
    getObject: (params: { id: string; options: { showContent: boolean } }) => Promise<unknown>;
  },
  _counterObjectId: string,
  currentBlobObjectId: string,
  signerAddress: string,
): Promise<string> {
  // 1. Get current blob ID from blob object
  const currentBlobId = await getBlobIdFromObject(suiClient, currentBlobObjectId);

  // 2. Read current value
  const currentValue = await readCounterValue(currentBlobId);

  // 3. Create new blob with incremented value
  const newValue = currentValue + 1n;
  const newBlobObjectId = await createCounterBlob(newValue, signerAddress);

  return newBlobObjectId;
}
