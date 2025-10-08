/// This example demonstrates an owned counter that stores its data in Walrus.
/// The counter object wraps a Walrus Blob which contains the counter data.
/// Rules:
/// - anyone can create a walrus counter by wrapping a Blob
/// - only the owner can unwrap and retrieve the Blob
module counter::walrus_counter;

use walrus::blob::Blob;

// === Structs ===

/// An owned counter that wraps a Walrus Blob.
/// The actual counter data is stored off-chain in Walrus blob storage.
public struct WalrusCounter has key {
    id: UID,
    blob: Blob,
}

// === Public Functions ===

/// Create and return a new WalrusCounter by wrapping a Blob.
public fun wrap(blob: Blob, ctx: &mut TxContext): WalrusCounter {
    WalrusCounter {
        id: object::new(ctx),
        blob,
    }
}

/// Unwrap and return the Blob (only owner can call this).
public fun unwrap(self: WalrusCounter): Blob {
    let WalrusCounter { id, blob } = self;
    object::delete(id);
    blob
}