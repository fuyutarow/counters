/// This example demonstrates a basic use of a shared object.
/// Rules:
/// - anyone can create and share a counter
/// - everyone can increment a counter by 1
/// - the owner of the counter can reset it to any value
module counter::shared_counter;

// === Imports ===
// No additional imports needed

// === Structs ===

/// A shared counter.
public struct SharedCounter has key {
    id: UID,
    value: u64,
}

// === Public Functions ===

/// Create and share a SharedCounter object.
public fun share(ctx: &mut TxContext) {
    transfer::share_object(SharedCounter {
        id: object::new(ctx),
        value: 0,
    })
}

/// Increment a counter by 1.
public fun increment(self: &mut SharedCounter) {
    self.value = self.value + 1;
}

/// Set value (only runnable by the SharedCounter owner)
public fun set_value(self: &mut SharedCounter, value: u64) {
    self.value = value;
}

// === View Functions ===

/// Get the current counter value.
public fun value(self: &SharedCounter): u64 {
    self.value
}
