module test_counter::simple_direct;

/// Simple counter with direct signature verification for testing
public struct SimpleCounter has key {
    id: UID,
    value: u64,
}

/// Create and share a simple counter
public fun share(ctx: &mut TxContext) {
    let counter = SimpleCounter {
        id: object::new(ctx),
        value: 0,
    };
    transfer::share_object(counter);
}

/// Direct signature verification and increment in one call
/// This demonstrates the simplified API we want for Multi-IBS
public entry fun verify_and_increment_direct(
    counter: &mut SimpleCounter,
    _signature_bytes: vector<u8>, // For testing, signature is ignored
    _message: vector<u8>,         // For testing, message is ignored
) {
    counter.value = counter.value + 1;
}

/// Get counter value
public fun value(self: &SimpleCounter): u64 {
    self.value
}