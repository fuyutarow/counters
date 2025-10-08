module counter::walrus_counter;

use std::option;
use walrus::blob::Blob;

public struct WalrusCounter has key, store {
    id: UID,
    blob: option::Option<Blob>,
}

public fun new(blob: Blob, ctx: &mut TxContext): WalrusCounter {
    WalrusCounter {
        id: object::new(ctx),
        blob: option::some(blob),
    }
}

public fun replace(self: &mut WalrusCounter, new_blob: Blob): Blob {
    self.blob.swap(new_blob)
}

public fun blob(self: &WalrusCounter): &Blob {
    option::borrow(&self.blob)
}

public fun take(self: &mut WalrusCounter): Blob {
    option::extract(&mut self.blob)
}
