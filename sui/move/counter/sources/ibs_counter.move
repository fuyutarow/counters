/// IBS (Identity-Based Signature) Counter
/// This counter requires IBS signature verification for operations
module counter::ibs_counter;

use sui::{bls12381, group_ops::Element};

// === Constants ===

const EInvalidSignature: u64 = 1;
const ECounterMismatch: u64 = 2;

// === Structs ===

/// IBS parameters for signature verification
public struct IBSParams has key, store {
    id: UID,
    mpk: Element<sui::bls12381::G2>, // Master public key (G2) directly stored
    dst: vector<u8>, // Domain separation tag
    t: u64, // Threshold value
    n: u64, // Total committee size
    version: u64, // Key generation version
}

/// IBS Counter with signature-protected operations (shared object)
public struct IBSCounter has key {
    id: UID,
    value: u64,
    params: IBSParams,
}

/// IBS verification proof token (one-time use)
public struct IBSProof has key {
    id: UID,
    counter_id: ID, // Target counter's ID
}

// === Public Functions ===

/// Create and initialize IBS parameters
public fun new_params(
    mpk: vector<u8>,
    dst: vector<u8>,
    t: u64,
    n: u64,
    version: u64,
    ctx: &mut TxContext,
): IBSParams {
    let mpk = bls12381::g2_from_bytes(&mpk);
    IBSParams {
        id: sui::object::new(ctx),
        mpk,
        dst,
        t,
        n,
        version,
    }
}

/// Create and share new IBS Counter
public fun share(params: IBSParams, ctx: &mut TxContext) {
    let counter = IBSCounter {
        id: sui::object::new(ctx),
        value: 0,
        params,
    };
    transfer::share_object(counter);
}

/// Verify IBS signature and mint proof token
public fun verify_and_mint_proof(
    self: &IBSCounter,
    sig_g1: vector<u8>,
    id: vector<u8>,
    msg: vector<u8>,
    ctx: &mut TxContext,
): IBSProof {
    // Verify IBS signature
    assert!(
        verify_ibs(
            &self.params,
            sig_g1,
            id,
            msg,
        ),
        EInvalidSignature,
    );

    // Mint and return proof token
    IBSProof {
        id: sui::object::new(ctx),
        counter_id: sui::object::id(self),
    }
}

/// Consume proof token and increment counter
public fun increment(self: &mut IBSCounter, proof: IBSProof) {
    let IBSProof { id, counter_id } = proof;

    // Verify proof is for this counter
    assert!(counter_id == sui::object::id(self), ECounterMismatch);

    // Increment counter value
    self.value = self.value + 1;

    // Proof token is automatically destroyed when consumed
    sui::object::delete(id);
}

/// Core IBS signature verification function
public fun verify_ibs(
    params: &IBSParams,
    sig_g1: vector<u8>,
    id: vector<u8>,
    msg: vector<u8>,
): bool {
    // 1) Restore G1 signature (use stored mpk directly)
    let sig_g1 = bls12381::g1_from_bytes(&sig_g1);

    // 2) Compute H(ID||DST||m)
    let mut message = vector[];
    message.append(id);
    message.append(params.dst);
    message.append(msg);
    let h_g1 = bls12381::hash_to_g1(&message);

    // 3) Verify pairing equation: e(sig, G2_gen) = e(H(ID||DST||m), mpk)
    let lhs = bls12381::pairing(&sig_g1, &bls12381::g2_generator());
    let rhs = bls12381::pairing(&h_g1, &params.mpk);

    // 4) Compare GT elements
    lhs == rhs
}

// === View Functions ===

/// Get counter value
public fun value(self: &IBSCounter): u64 {
    self.value
}

/// Get IBS parameters version
public fun version(self: &IBSCounter): u64 {
    self.params.version
}

/// Get threshold parameters
public fun threshold_params(self: &IBSCounter): (u64, u64) {
    (self.params.t, self.params.n)
}

// === Test Helper Functions ===

#[test_only]
/// Create a counter for testing purposes
public fun test_create_counter(params: IBSParams, ctx: &mut TxContext): IBSCounter {
    IBSCounter {
        id: sui::object::new(ctx),
        value: 0,
        params,
    }
}

#[test_only]
/// Create a proof token for testing purposes
public fun test_create_proof(counter: &IBSCounter, ctx: &mut TxContext): IBSProof {
    IBSProof {
        id: sui::object::new(ctx),
        counter_id: sui::object::id(counter),
    }
}

#[test_only]
/// Destroy params for testing (to handle drop constraint)
public fun test_destroy_params(params: IBSParams) {
    let IBSParams { id, mpk: _, dst: _, t: _, n: _, version: _ } = params;
    sui::object::delete(id);
}

#[test_only]
/// Destroy counter for testing (to handle drop constraint)
public fun test_destroy_counter(counter: IBSCounter) {
    let IBSCounter { id, value: _, params } = counter;
    sui::object::delete(id);
    test_destroy_params(params);
}

#[test_only]
/// Destroy proof for testing (to handle drop constraint)
public fun test_destroy_proof(proof: IBSProof) {
    let IBSProof { id, counter_id: _ } = proof;
    sui::object::delete(id);
}
