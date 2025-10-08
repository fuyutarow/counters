# Walrus Counter Implementation

## Overview

The Walrus Counter is a decentralized counter that stores its state on Walrus (a decentralized storage network) instead of on the Sui blockchain directly. This implementation demonstrates how to integrate Walrus blob storage with Sui smart contracts.

## Architecture

### Components

1. **Walrus Client Implementations** (`src/lib/`)
   - `walrusClient.ts` - Production HTTP API client (recommended)
   - `walrus.simple.ts` - Simplified HTTP API client for testing
   - `walrusClient.new.ts` - Official SDK client (has WASM build issues with Next.js)

2. **Move Contract** (`move/counter/sources/walrus_counter.move`)
   - Stores reference to Walrus Blob object
   - Provides `new()` and `replace()` functions

3. **Frontend Component** (`src/components/WalrusCounter.tsx`)
   - React component for interacting with Walrus counters
   - Handles blob creation and counter updates

4. **Tests** (`__tests__/walrus-counter.test.ts`)
   - Node.js integration tests

## How It Works

### Data Flow

```
User Action → Create Blob → Store on Walrus → Update Counter → Read Blob → Display Value
```

1. **Counter value encoding**: Values are BCS-encoded using `CounterValueBcs` schema
2. **Blob storage**: Encoded data is stored on Walrus via HTTP Publisher API
3. **On-chain reference**: Move contract stores the Sui Blob object ID
4. **Value retrieval**: Client reads blob_id from counter, fetches blob from Walrus, decodes BCS

### BCS Encoding

```typescript
const CounterValueBcs = bcs.struct("CounterValue", {
  value: bcs.u64(),
});
```

- Input type: `number | string | bigint`
- Output type: `string` (parsed from BCS u64)
- No corresponding Move struct needed (blob content is opaque bytes)

## Walrus Client API

### `walrusClient.ts` (Recommended)

**Key Functions:**

```typescript
// Store arbitrary blob data
storeBlob(data: Uint8Array | string, ownerAddress?: string, epochs?: number): Promise<string>
// Returns: Sui Blob object ID

// Read blob by Walrus blob ID
readBlob(blobId: string): Promise<Uint8Array>

// Get Walrus blob ID from Sui Blob object
getBlobIdFromObject(suiClient, blobObjectId: string): Promise<string>

// Convert u256 blob ID to base64url format
blobIdFromInt(blobId: bigint | string): string

// High-level counter operations
createCounterBlob(value: number | string | bigint, ownerAddress?: string): Promise<string>
readCounterValue(blobId: string): Promise<bigint>
```

**Why HTTP API instead of SDK?**

The official `@mysten/walrus` SDK depends on WASM which causes Next.js build failures. The HTTP Publisher API provides equivalent functionality for basic operations.

**Public Publishers:**

Uses Graphyte's free testnet endpoints:
- Aggregator: `https://testnet-aggregator.walrus.graphyte.dev/v1`
- Publisher: `https://testnet-publisher.walrus.graphyte.dev/v1`

⚠️ **Important**: Public publishers consume their own tokens and may become unavailable when depleted. For production, consider:
- Running your own Walrus publisher node
- Using Walrus CLI directly
- Implementing fallback to multiple publishers

### Response Validation

Uses Zod schemas to validate runtime responses from Walrus HTTP API:

```typescript
const walrusStoreResponseSchema = z.union([
  z.object({
    newlyCreated: z.object({
      blobObject: z.object({
        id: z.string(),         // Sui Blob object ID
        blobId: z.string(),     // Walrus blob ID
        size: z.number(),
        // ...
      }),
    }),
  }),
  z.object({
    alreadyCertified: z.object({
      blobId: z.string(),
      endEpoch: z.number(),
    }),
  }),
]);
```

## Move Contract

### Structure

```move
struct WalrusCounter has key, store {
    id: UID,
    blob: Blob,  // Reference to Walrus Blob object
}
```

### Functions

```move
// Create new counter with initial blob
public fun new(blob: Blob): WalrusCounter

// Replace blob reference with new value
public fun replace(counter: &mut WalrusCounter, blob: Blob): Blob
```

**Key Design:**
- Counter stores Sui `Blob` object (contains `blob_id` field)
- Blob object is transferable and owned by user
- `replace()` swaps old blob with new blob, returns old blob
- Old blob can be deleted or kept

## Frontend Integration

### Component Usage

```tsx
import { WalrusCounter } from "@/components/WalrusCounter";

<WalrusCounter id="0x..." />
```

### Increment Flow

```typescript
// 1. Read current value from Walrus
const currentValue = await readCounterValue(blobId);

// 2. Create new blob with incremented value
const newBlobObjectId = await createCounterBlob(
  currentValue + 1n,
  userAddress
);

// 3. Execute replace transaction
const tx = new Transaction();
walrusCounter.replace({
  package: counterPackageId,
  arguments: [tx.object(counterId), tx.object(newBlobObjectId)],
})(tx);

await signAndExecuteTransaction({ transaction: tx });
```

### Set Value Flow

```typescript
// 1. Create new blob with target value
const newBlobObjectId = await createCounterBlob(newValue, userAddress);

// 2. Execute replace transaction (same as increment)
```

## Testing

### Test Suite: `__tests__/walrus-counter.test.ts`

**Current Status:** Most tests are skipped due to public publisher instability.

**Test Cases:**

1. ✓ Store and read blob data
   - Tests basic blob storage and retrieval
   - Validates blob ID conversion

2. ✓ BCS encoding/decoding
   - Tests counter value serialization
   - Validates u64 → bigint conversion

3. ✓ Counter creation
   - Tests Move contract `new()` function
   - Validates object creation on-chain

4. ✓ Full lifecycle
   - Create counter → Increment → Read value
   - End-to-end integration test

**Known Issues:**

- HTTP Publisher API doesn't reliably integrate with Walrus storage nodes
- Blob propagation to aggregators can be slow (10+ seconds)
- Public publishers may be unavailable

## Type Safety

### TypeScript Type Inference

```typescript
// Automatic type inference from BCS schema
type WalrusCounterValueInput = typeof CounterValueBcs.$inferInput;
// → { value: number | string | bigint }

type WalrusCounterValue = typeof CounterValueBcs.$inferType;
// → { value: string }
```

### Zod Validation

Used for runtime validation of:
- Walrus API responses (`walrusStoreResponseSchema`)
- Sui object content (`blobObjectSchema`, `walrusCounterFieldsSchema`)

**Why Zod?**
- `@mysten/sui` SDK types are loose: `fields: { [key: string]: MoveValue }`
- Zod provides concrete type information at runtime
- Catches API changes and malformed responses

## Error Handling

Uses `neverthrow` for functional error handling:

```typescript
import { ResultAsync } from "neverthrow";

const result = await ResultAsync.fromPromise(
  readCounterValue(blobId),
  (error) => new Error(`Failed to read blob: ${error}`)
);

result.match(
  (value) => console.log("Success:", value),
  (error) => console.error("Error:", error)
);
```

## Blob ID Formats

Walrus uses two formats for blob IDs:

### 1. u256 (32-byte integer)
- Stored in Sui Blob object as decimal string or number
- Example: `"123456789..."`

### 2. Base64url (URL-safe base64)
- Used in HTTP API requests
- No padding, `-` instead of `+`, `_` instead of `/`
- Example: `"AQ1B2C3D..."`

### Conversion

```typescript
// Convert u256 to base64url
blobIdFromInt(blobId: bigint | string): string {
  return bcs.u256()
    .serialize(blobId)
    .toBase64()
    .replace(/=*$/, "")      // Remove padding
    .replace(/\+/g, "-")     // URL-safe
    .replace(/\//g, "_");    // URL-safe
}
```

## Best Practices

### 1. Always Validate Responses

```typescript
const parseResult = schema.safeParse(data);
if (!parseResult.success) {
  throw new Error(`Invalid response: ${parseResult.error.message}`);
}
```

### 2. Handle Blob Propagation Delays

```typescript
// Wait for blob to propagate to aggregators
await new Promise(resolve => setTimeout(resolve, 10000));
```

### 3. Specify Owner Address

```typescript
// Send Blob object to user's address
await storeBlob(data, userAddress, epochs);
```

Without `ownerAddress`, blob object may be sent to publisher's address.

### 4. Error Context

```typescript
throw new Error(
  `Failed to read blob (blob_id: ${blobId}): ${error.message}`
);
```

Include relevant context (blob IDs, object IDs) in error messages.

## Limitations & Known Issues

### 1. Public Publisher Instability
- Free testnet publishers may be unavailable
- Token depletion causes service interruption
- No automatic failover in current implementation

### 2. WASM Build Issues
- Official `@mysten/walrus` SDK causes Next.js build failures
- HTTP API used as workaround
- Some SDK features unavailable

### 3. Blob Propagation Latency
- Blobs take 5-10+ seconds to propagate to aggregators
- No real-time read-after-write consistency
- Requires polling or fixed delays

### 4. Blob ID Mismatch
- Publisher-returned blob_id may not match Sui object blob_id
- Must query Sui object to get authoritative blob_id
- Adds extra RPC call overhead

### 5. Type System Gaps
- `@mysten/sui` SDK has loose typing for Move objects
- Requires manual Zod schemas for type safety
- No compile-time validation of Move struct fields

## Production Considerations

For production deployments:

1. **Run Your Own Publisher**
   - Deploy Walrus publisher node
   - Manage your own token funding
   - Control availability and performance

2. **Implement Retry Logic**
   - Multiple publisher endpoints
   - Exponential backoff
   - Circuit breaker pattern

3. **Monitor Blob Availability**
   - Track aggregator health
   - Alert on read failures
   - Implement caching layer

4. **Optimize Costs**
   - Choose appropriate epoch duration
   - Delete old blobs when replaced
   - Batch blob operations

5. **Consider SDK Migration**
   - Monitor `@mysten/walrus` WASM issues
   - Plan migration path when fixed
   - Maintain HTTP API fallback

## Related Documentation

- [Walrus Official Docs](https://docs.walrus.site)
- [Walrus HTTP API](https://docs.wal.app/usage/web-api.html)
- [BCS Encoding](https://github.com/MystenLabs/sui/tree/main/sdk/bcs)
- [Sui Move by Example](https://examples.sui.io)

## Example: Complete Workflow

```typescript
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import * as walrusCounter from "@/generated/counter/walrus_counter";
import {
  createCounterBlob,
  getBlobIdFromObject,
  readCounterValue
} from "@/lib/walrusClient";

// 1. Create initial blob
const blobObjectId = await createCounterBlob(0, userAddress);

// 2. Create counter on Sui
const tx1 = new Transaction();
const counter = walrusCounter._new({
  package: COUNTER_PACKAGE_ID,
  arguments: [tx1.object(blobObjectId)],
})(tx1);
tx1.transferObjects([counter], userAddress);

const result = await client.signAndExecuteTransaction({
  transaction: tx1,
  signer: keypair,
});

const counterId = result.effects?.created?.[0]?.reference?.objectId;

// 3. Increment counter
const newBlobObjectId = await createCounterBlob(1, userAddress);

const tx2 = new Transaction();
walrusCounter.replace({
  package: COUNTER_PACKAGE_ID,
  arguments: [tx2.object(counterId), tx2.object(newBlobObjectId)],
})(tx2);

await client.signAndExecuteTransaction({
  transaction: tx2,
  signer: keypair,
});

// 4. Read final value
const counterObj = await client.getObject({
  id: counterId,
  options: { showContent: true },
});

const blobId = counterObj.data.content.fields.blob.fields.blob_id;
const value = await readCounterValue(blobId);

console.log("Counter value:", value); // 1n
```

## Summary

The Walrus Counter demonstrates:
- ✅ Off-chain state storage using Walrus
- ✅ BCS encoding for type-safe serialization
- ✅ Zod validation for runtime type safety
- ✅ Integration with Sui Move contracts
- ✅ Functional error handling with neverthrow
- ⚠️ Workarounds for SDK limitations
- ⚠️ Handling of public publisher instability

This pattern can be extended to store larger application state, files, or any data that benefits from decentralized storage while maintaining on-chain references for access control and ownership.
