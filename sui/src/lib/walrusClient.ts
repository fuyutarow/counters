/**
 * HTTP-based Walrus client for Next.js
 * Uses the Walrus HTTP API directly to avoid WASM build issues
 */

import { bcs } from "@mysten/sui/bcs";
import { z } from "zod";

// Using Mysten's public aggregator and publisher
// See: https://docs.walrus.site/usage/web-api.html
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
 * @returns Sui object ID of the created Blob object
 */
export async function storeBlob(data: Uint8Array | string, ownerAddress?: string): Promise<string> {
  // TypeScript型定義の問題:
  // - Uint8Array.bufferの型は ArrayBufferLike (= ArrayBuffer | SharedArrayBuffer)
  // - BodyInitが期待するのは ArrayBufferView<ArrayBuffer> | ArrayBuffer
  // - ArrayBufferLikeとArrayBufferは名目型の違いで互換性がない
  // - 実行時は動作するため、型アサーションで対応
  const body = (typeof data === "string" ? data : data.buffer) as BodyInit;

  const url = new URL(`${PUBLISHER_URL}/v1/blobs`);
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
    throw new Error(`Failed to store blob: ${response.statusText}`);
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
 * Read data from Walrus
 */
export async function readBlob(blobId: string): Promise<Uint8Array> {
  const url = `${AGGREGATOR_URL}/v1/${blobId}`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorMsg = `Failed to read blob from Walrus: ${response.status} ${response.statusText}`;
    throw new Error(errorMsg);
  }
  return new Uint8Array(await response.arrayBuffer());
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
 * Create counter value blob in Walrus (BCS encoded)
 *
 * @param value - number | string | bigint (BCS u64の入力型)
 * @param ownerAddress - Optional Sui address to send the Blob object to
 * @returns Sui object ID of the created Blob object
 */
export async function createCounterBlob(
  value: WalrusCounterValueInput["value"],
  ownerAddress?: string,
): Promise<string> {
  const bcsBytes = CounterValueBcs.serialize({ value }).toBytes();
  return await storeBlob(bcsBytes, ownerAddress);
}
