/// Private Counter with ZK Proof (+1 only increment)
///
/// This module implements a privacy-preserving counter where:
/// - The counter value is never revealed on-chain (stored as commitment)
/// - Only +1 increments are allowed (enforced by ZK circuit)
/// - Uses Groth16 proof system with BN254 curve
/// - Poseidon hash for ZK-friendly commitments
///
/// Security properties:
/// - Verification key is fixed at creation (prevents circuit swapping)
/// - State binding ensures old commitment matches on-chain state
/// - ZK circuit enforces: salt proof, valid old commitment, +1 increment, range constraint
module counter::private_counter;

use sui::{bcs, groth16, poseidon};

// === Constants ===
const BN254_SCALAR_FIELD_SIZE_BYTES: u64 = 32;

#[allow(unused_const)]
const GROTH16_PROOF_POINTS_SIZE: u64 = 192; // 3 points × 64 bytes

#[allow(unused_const)]
const BN254_FIELD_SIZE: u256 =
    21888242871839275222246405745257275088548364400416034343698204186575808495617;

// === Errors ===
#[error]
const ESaltHashMismatch: vector<u8> = b"Salt hash does not match on-chain state";

#[error]
const EPreviousHashMismatch: vector<u8> = b"Previous value hash does not match current state";

#[error]
const EInvalidIncrementProof: vector<u8> = b"ZK proof verification failed for increment operation";

#[error]
const EInvalidVerifyingKey: vector<u8> = b"Verifying key format is invalid";

#[error]
const EInvalidPublicInputSize: vector<u8> = b"Public input size is invalid";

// === Structs ===

/// A private counter that stores hashes instead of actual values.
/// The actual count value is never revealed on-chain.
/// This is a single-owner object - only the owner can increment it.
public struct PrivateCounter has key, store {
    id: UID,
    // ZK proof state
    salt_hash: u256, // Poseidon(salt) - Poseidon hash of the salt
    value_hash: u256, // Poseidon(v, r) - Poseidon hash of value with randomness
    // Verifying key (circuit pinning)
    vk_hash: u256, // Poseidon(vk) - Poseidon hash of the verifying key (tamper prevention)
}

// === Public Functions ===

/// Creates a new private counter with initial value hash.
/// Returns an owned object that can be transferred to the desired owner.
///
/// @param initial_value_hash: Poseidon(v_0, r_0) - hash of initial value with randomness
/// @param salt_value: Salt value for Poseidon hashing
/// @param verifying_key_elements: Verifying key as BN254 field elements
/// @param ctx: Transaction context
/// @return: New PrivateCounter object (owned)
public fun new(
    initial_value_hash: u256,
    salt_value: u256,
    verifying_key_elements: vector<u256>,
    ctx: &mut TxContext,
): PrivateCounter {
    // Compute salt hash using Poseidon
    let salt_hash = poseidon::poseidon_bn254(&vector[salt_value]);

    // Compute verifying key hash using Poseidon for tamper detection
    let vk_hash = poseidon::poseidon_bn254(&verifying_key_elements);

    PrivateCounter {
        id: object::new(ctx),
        salt_hash,
        value_hash: initial_value_hash,
        vk_hash,
    }
}

/// Increments the counter by 1 with ZK proof verification.
/// Only the owner of this object can call this function (enforced by ownership).
///
/// The proof must demonstrate:
/// 1. Knowledge of salt: Poseidon(salt) = salt_hash
/// 2. Valid old hash: h_old = Poseidon(v, r)
/// 3. +1 increment: h_new = Poseidon(v+1, r')
/// 4. Range constraint: v is within valid range
///
/// @param self: Mutable reference to the counter (owner only)
/// @param proof_bytes: Groth16 proof points (serialized)
/// @param public_inputs_bytes: Public inputs (salt_hash || h_old || h_new)
/// @param verifying_key_elements: Verifying key as BN254 field elements
public fun increment(
    self: &mut PrivateCounter,
    proof_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
    verifying_key_elements: vector<u256>,
) {
    // 1. Verify verifying key hasn't been tampered using Poseidon
    let vk_hash = poseidon::poseidon_bn254(&verifying_key_elements);
    assert!(self.vk_hash == vk_hash, EInvalidVerifyingKey);

    // 2. Parse public inputs
    let (claimed_salt_hash, previous_hash, updated_hash) = parse_public_inputs(
        &public_inputs_bytes,
    );

    // 3. Validate state consistency with on-chain state
    assert!(self.salt_hash == claimed_salt_hash, ESaltHashMismatch);
    assert!(self.value_hash == previous_hash, EPreviousHashMismatch);

    // 4. Prepare verifying key bytes for Groth16
    let verifying_key_bytes = u256_vector_to_bytes(&verifying_key_elements);

    // 5. Verify ZK proof
    let is_valid_proof = verify_increment_proof(
        &verifying_key_bytes,
        &proof_bytes,
        &public_inputs_bytes,
    );
    assert!(is_valid_proof, EInvalidIncrementProof);

    // 6. Update value hash
    self.value_hash = updated_hash;
}

// === View Functions ===

/// Returns the current value hash (does not reveal actual value)
public fun value_hash(self: &PrivateCounter): u256 {
    self.value_hash
}

/// Returns the salt hash (Poseidon hash)
public fun salt_hash(self: &PrivateCounter): u256 {
    self.salt_hash
}

/// Returns the verifying key hash (Poseidon hash)
public fun verifying_key_hash(self: &PrivateCounter): u256 {
    self.vk_hash
}

// === Private Helper Functions ===

/// Parses public inputs from BCS-encoded bytes.
/// Expected format: salt_hash (u256) || h_old (u256) || h_new (u256)
fun parse_public_inputs(public_inputs_bytes: &vector<u8>): (u256, u256, u256) {
    let input_len = public_inputs_bytes.length();
    let expected_len = BN254_SCALAR_FIELD_SIZE_BYTES * 3;
    assert!(input_len == expected_len, EInvalidPublicInputSize);

    let mut salt_hash_bytes = vector::empty<u8>();
    let mut prev_hash_bytes = vector::empty<u8>();
    let mut updated_hash_bytes = vector::empty<u8>();

    let mut i = 0;

    // Extract salt_hash bytes (first 32 bytes)
    while (i < BN254_SCALAR_FIELD_SIZE_BYTES) {
        salt_hash_bytes.push_back(public_inputs_bytes[i]);
        i = i + 1;
    };

    // Extract previous_hash (next 32 bytes)
    while (i < BN254_SCALAR_FIELD_SIZE_BYTES * 2) {
        prev_hash_bytes.push_back(public_inputs_bytes[i]);
        i = i + 1;
    };

    // Extract updated_hash (last 32 bytes)
    while (i < expected_len) {
        updated_hash_bytes.push_back(public_inputs_bytes[i]);
        i = i + 1;
    };

    // Convert all bytes to u256 (BCS deserialization)
    let salt_hash_u256 = bytes_to_u256(&salt_hash_bytes);
    let prev_hash_u256 = bytes_to_u256(&prev_hash_bytes);
    let updated_hash_u256 = bytes_to_u256(&updated_hash_bytes);

    (salt_hash_u256, prev_hash_u256, updated_hash_u256)
}

/// Verifies the Groth16 proof for +1 increment operation
fun verify_increment_proof(
    verifying_key_bytes: &vector<u8>,
    proof_bytes: &vector<u8>,
    public_inputs_bytes: &vector<u8>,
): bool {
    // Prepare verifying key
    let curve = groth16::bn254();
    let prepared_vk = groth16::prepare_verifying_key(&curve, verifying_key_bytes);

    // Create public inputs wrapper
    let public_inputs = groth16::public_proof_inputs_from_bytes(*public_inputs_bytes);

    // Create proof points wrapper
    let proof_points = groth16::proof_points_from_bytes(*proof_bytes);

    // Verify proof
    groth16::verify_groth16_proof(
        &curve,
        &prepared_vk,
        &public_inputs,
        &proof_points,
    )
}

/// Converts a vector of u256 values to bytes (BCS encoding)
fun u256_vector_to_bytes(elements: &vector<u256>): vector<u8> {
    let mut result = vector::empty<u8>();
    let mut i = 0;
    let len = elements.length();

    while (i < len) {
        let element_bytes = bcs::to_bytes(&elements[i]);
        result.append(element_bytes);
        i = i + 1;
    };

    result
}

/// Converts bytes to u256 using BCS deserialization
fun bytes_to_u256(bytes: &vector<u8>): u256 {
    let mut bcs_reader = bcs::new(*bytes);
    bcs_reader.peel_u256()
}

// === Test Functions ===

#[test_only]
use sui::test_scenario;

#[test_only]
/// Creates a test counter with dummy hashes
public fun create_test_counter(ctx: &mut TxContext): PrivateCounter {
    let dummy_value_hash: u256 = 123456;
    let dummy_salt: u256 = 42;
    let dummy_vk = vector[1u256, 2u256, 3u256]; // Dummy verifying key elements

    new(
        dummy_value_hash,
        dummy_salt,
        dummy_vk,
        ctx,
    )
}

#[test]
fun test_counter_creation() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);

    let counter = create_test_counter(scenario.ctx());

    // Verify initial state
    assert!(counter.value_hash() > 0, 0);
    assert!(counter.salt_hash() > 0, 1);
    assert!(counter.verifying_key_hash() > 0, 2);

    transfer::transfer(counter, owner);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = EInvalidVerifyingKey)]
fun test_invalid_verifying_key() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);

    let mut counter = create_test_counter(scenario.ctx());

    // Try to increment with wrong verifying key
    let mut dummy_proof = vector::empty<u8>();
    let mut i = 0;
    while (i < 192) {
        dummy_proof.push_back(0u8);
        i = i + 1;
    };

    let mut dummy_inputs = vector::empty<u8>();
    i = 0;
    while (i < 96) {
        dummy_inputs.push_back(0u8);
        i = i + 1;
    };

    let wrong_vk = vector[99u256, 88u256, 77u256]; // Different VK

    counter.increment(dummy_proof, dummy_inputs, wrong_vk);

    transfer::transfer(counter, owner);
    scenario.end();
}
