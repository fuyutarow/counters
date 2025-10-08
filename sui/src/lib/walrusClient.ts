/**
 * HTTP-based Walrus client for Next.js
 * Uses the Walrus HTTP API directly to avoid WASM build issues
 */

// Using Mysten's public aggregator and publisher
// See: https://docs.walrus.site/usage/web-api.html
const AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space";
const PUBLISHER_URL = "https://publisher.walrus-testnet.walrus.space";

export interface WalrusStoreResponse {
  newlyCreated?: {
    blobObject: {
      id: string;
      storedEpoch: number;
      blobId: string;
      size: number;
      erasureCodeType: string;
      certifiedEpoch: number;
      storage: {
        id: string;
        startEpoch: number;
        endEpoch: number;
        storageSize: number;
      };
    };
    encodedSize: number;
    cost: number;
  };
  alreadyCertified?: {
    blobId: string;
    event: {
      txDigest: string;
      eventSeq: string;
    };
    endEpoch: number;
  };
}

/**
 * Counter value stored in Walrus blob
 */
export interface WalrusCounterValue {
  value: number;
}

/**
 * Store data on Walrus
 */
export async function storeBlob(data: Uint8Array | string): Promise<string> {
  const response = await fetch(`${PUBLISHER_URL}/v1/store`, {
    method: "PUT",
    body: data as BodyInit,
    headers: {
      "Content-Type": "application/octet-stream",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to store blob: ${response.statusText}`);
  }

  const result = (await response.json()) as WalrusStoreResponse;

  if (result.newlyCreated) {
    return result.newlyCreated.blobObject.blobId;
  }
  if (result.alreadyCertified) {
    return result.alreadyCertified.blobId;
  }

  throw new Error("Unexpected response from Walrus");
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
  const data: WalrusCounterValue = JSON.parse(text);
  return data.value;
}

/**
 * Create counter value blob in Walrus
 */
export async function createCounterBlob(value: number): Promise<string> {
  const counterData: WalrusCounterValue = { value };
  const blob = JSON.stringify(counterData);
  return await storeBlob(blob);
}
