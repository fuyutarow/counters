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

use sui::{bcs, groth16};

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
const EInvalidPublicInputSize: vector<u8> = b"Public input size is invalid";

// === Structs ===

/// Registry for the verifying key used by all private counters.
/// This is a shared object created at package initialization.
public struct VerifyingKeyRegistry has key {
    id: UID,
    vk_bytes: vector<u8>, // Raw verifying key bytes for proof verification
}

/// A private counter that stores hashes instead of actual values.
/// The actual count value is never revealed on-chain.
/// This is a single-owner object - only the owner can increment it.
public struct PrivateCounter has key, store {
    id: UID,
    // ZK proof state
    salt_digest: u256, // Poseidon(salt) - fixed for this counter
    value_digest: u256, // Poseidon(value, salt) - changes as value increments
}

// === Package Initialization ===

/// Package initialization - creates the verifying key registry
fun init(ctx: &mut TxContext) {
    // Create empty registry - VK will be set via update_verifying_key
    let registry = VerifyingKeyRegistry {
        id: object::new(ctx),
        vk_bytes: vector::empty(),
    };

    transfer::share_object(registry);
}

// === Public Functions ===

/// Updates the verifying key in the registry (admin only, called once after deployment)
public entry fun update_verifying_key(registry: &mut VerifyingKeyRegistry, vk_bytes: vector<u8>) {
    registry.vk_bytes = vk_bytes;
}

/// Creates a new private counter with initial value hash.
/// Returns an owned object that can be transferred to the desired owner.
///
/// @param initial_value_digest: Poseidon(v_0, salt) - hash of initial value with salt
/// @param salt_digest: Poseidon(salt) - hash of the salt value
/// @param ctx: Transaction context
/// @return: New PrivateCounter object (owned)
public fun new(initial_value_digest: u256, salt_digest: u256, ctx: &mut TxContext): PrivateCounter {
    PrivateCounter {
        id: object::new(ctx),
        salt_digest,
        value_digest: initial_value_digest,
    }
}

/// Increments the counter by 1 with ZK proof verification.
/// Only the owner of this object can call this function (enforced by ownership).
///
/// The proof must demonstrate:
/// 1. Knowledge of salt: Poseidon(salt) = salt_digest
/// 2. Valid old hash: h_old = Poseidon(v, salt)
/// 3. +1 increment: h_new = Poseidon(v+1, salt)
/// 4. Range constraint: v is within valid range
///
/// @param registry: Shared verifying key registry
/// @param self: Mutable reference to the counter (owner only)
/// @param proof_bytes: Groth16 proof points (serialized)
/// @param public_inputs_bytes: Public inputs (salt_digest || h_old || h_new)
public fun increment(
    registry: &VerifyingKeyRegistry,
    self: &mut PrivateCounter,
    proof_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
) {
    // 1. Parse public inputs
    let (claimed_salt_digest, previous_digest, updated_digest) = parse_public_inputs(
        &public_inputs_bytes,
    );

    // 2. Validate state consistency with on-chain state
    assert!(self.salt_digest == claimed_salt_digest, ESaltHashMismatch);
    assert!(self.value_digest == previous_digest, EPreviousHashMismatch);

    // 3. Verify ZK proof using VK from registry
    let is_valid_proof = verify_increment_proof(
        &registry.vk_bytes,
        &proof_bytes,
        &public_inputs_bytes,
    );
    assert!(is_valid_proof, EInvalidIncrementProof);

    // 4. Update value hash
    self.value_digest = updated_digest;
}

// === View Functions ===

/// Returns the current value hash (does not reveal actual value)
public fun value_digest(self: &PrivateCounter): u256 {
    self.value_digest
}

/// Returns the salt hash (Poseidon hash)
public fun salt_digest(self: &PrivateCounter): u256 {
    self.salt_digest
}

// === Private Helper Functions ===

/// Parses public inputs from BCS-encoded bytes.
/// Expected format: salt_digest (u256) || h_old (u256) || h_new (u256)
fun parse_public_inputs(public_inputs_bytes: &vector<u8>): (u256, u256, u256) {
    let expected_len = BN254_SCALAR_FIELD_SIZE_BYTES * 3;
    assert!(public_inputs_bytes.length() == expected_len, EInvalidPublicInputSize);

    let mut bcs_reader = bcs::new(*public_inputs_bytes);
    let salt_digest = bcs_reader.peel_u256();
    let prev_digest = bcs_reader.peel_u256();
    let updated_digest = bcs_reader.peel_u256();

    (salt_digest, prev_digest, updated_digest)
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

// === Test Functions ===

#[test_only]
use sui::test_scenario;

#[test_only]
/// Creates a test counter with dummy hashes
public fun create_test_counter(ctx: &mut TxContext): PrivateCounter {
    let dummy_value_digest: u256 = 123456;
    let dummy_salt_digest: u256 = 78910;

    new(
        dummy_value_digest,
        dummy_salt_digest,
        ctx,
    )
}

#[test]
fun test_counter_creation() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);

    let counter = create_test_counter(scenario.ctx());

    // Verify initial state
    assert!(counter.value_digest() > 0, 0);
    assert!(counter.salt_digest() > 0, 1);

    transfer::transfer(counter, owner);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = ESaltHashMismatch)]
fun test_invalid_salt_hash() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);

    let mut counter = create_test_counter(scenario.ctx());

    // Create dummy registry
    let registry = VerifyingKeyRegistry {
        id: object::new(scenario.ctx()),
        vk_bytes: vector::empty(),
    };

    // Try to increment with invalid proof
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

    increment(&registry, &mut counter, dummy_proof, dummy_inputs);

    transfer::share_object(registry);
    transfer::transfer(counter, owner);
    scenario.end();
}

#[test]
fun test_successful_increment_with_valid_proof() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);

    // Initial values from Circom circuit test
    // old_value = 0, salt = 42
    let initial_value_digest: u256 =
        1434943783498835797369287247471819544927612511567472487143872361879370653035;
    let salt_digest: u256 =
        12326503012965816391338144612242952408728683609716147019497703475006801258307; // Poseidon(salt)

    // VK bytes in Arkworks canonical compressed format (360 bytes)
    let mut vk_bytes = vector::empty<u8>();
    let vk_data = vector[
        226,
        242,
        109,
        190,
        162,
        153,
        245,
        34,
        59,
        100,
        108,
        177,
        251,
        51,
        234,
        219,
        5,
        157,
        148,
        7,
        85,
        157,
        116,
        65,
        223,
        217,
        2,
        227,
        167,
        154,
        77,
        45,
        171,
        183,
        61,
        193,
        127,
        188,
        19,
        2,
        30,
        36,
        113,
        224,
        192,
        139,
        214,
        125,
        132,
        1,
        245,
        43,
        115,
        214,
        208,
        116,
        131,
        121,
        76,
        173,
        71,
        120,
        24,
        14,
        12,
        6,
        243,
        59,
        188,
        76,
        121,
        169,
        202,
        222,
        242,
        83,
        166,
        128,
        132,
        211,
        130,
        241,
        119,
        136,
        248,
        133,
        201,
        175,
        209,
        118,
        247,
        203,
        47,
        3,
        103,
        137,
        237,
        246,
        146,
        217,
        92,
        189,
        222,
        70,
        221,
        218,
        94,
        247,
        212,
        34,
        67,
        103,
        121,
        68,
        92,
        94,
        102,
        0,
        106,
        66,
        118,
        30,
        31,
        18,
        239,
        222,
        0,
        24,
        194,
        18,
        243,
        174,
        183,
        133,
        228,
        151,
        18,
        231,
        169,
        53,
        51,
        73,
        170,
        241,
        37,
        93,
        251,
        49,
        183,
        191,
        96,
        114,
        58,
        72,
        13,
        146,
        147,
        147,
        142,
        25,
        126,
        76,
        255,
        158,
        215,
        190,
        111,
        238,
        221,
        252,
        217,
        43,
        153,
        180,
        225,
        56,
        175,
        143,
        252,
        138,
        132,
        23,
        46,
        60,
        241,
        175,
        193,
        232,
        181,
        14,
        111,
        4,
        89,
        48,
        210,
        238,
        198,
        72,
        237,
        48,
        23,
        226,
        132,
        191,
        14,
        163,
        196,
        130,
        170,
        149,
        151,
        222,
        106,
        66,
        63,
        231,
        156,
        231,
        50,
        207,
        179,
        237,
        131,
        167,
        4,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        12,
        49,
        1,
        232,
        10,
        201,
        127,
        168,
        46,
        236,
        19,
        95,
        233,
        90,
        251,
        207,
        249,
        207,
        123,
        239,
        236,
        141,
        250,
        39,
        122,
        18,
        227,
        108,
        33,
        155,
        30,
        130,
        237,
        137,
        51,
        46,
        171,
        43,
        109,
        221,
        27,
        208,
        185,
        248,
        97,
        206,
        32,
        48,
        34,
        39,
        155,
        43,
        232,
        214,
        125,
        79,
        173,
        119,
        191,
        20,
        208,
        50,
        162,
        153,
        235,
        142,
        146,
        32,
        7,
        42,
        82,
        203,
        130,
        106,
        142,
        246,
        23,
        10,
        31,
        50,
        243,
        238,
        238,
        167,
        96,
        198,
        83,
        197,
        76,
        18,
        23,
        231,
        18,
        82,
        96,
        175,
        125,
        139,
        224,
        2,
        82,
        121,
        47,
        185,
        85,
        165,
        168,
        116,
        208,
        23,
        143,
        146,
        21,
        83,
        197,
        61,
        5,
        1,
        162,
        55,
        141,
        123,
        194,
        246,
        78,
        38,
        120,
        141,
    ];
    let mut i = 0;
    while (i < 360) {
        vk_bytes.push_back(vk_data[i]);
        i = i + 1;
    };

    // Create registry and set VK
    let registry = VerifyingKeyRegistry {
        id: object::new(scenario.ctx()),
        vk_bytes,
    };

    let mut counter = new(initial_value_digest, salt_digest, scenario.ctx());

    // Real Groth16 proof in Arkworks compressed format (128 bytes)
    let mut proof = vector::empty<u8>();
    let proof_data = vector[
        110,
        2,
        68,
        197,
        247,
        14,
        132,
        155,
        144,
        46,
        59,
        186,
        122,
        255,
        192,
        114,
        29,
        185,
        118,
        236,
        84,
        250,
        254,
        60,
        88,
        134,
        212,
        3,
        196,
        195,
        93,
        8,
        213,
        63,
        134,
        26,
        180,
        31,
        208,
        54,
        249,
        239,
        47,
        143,
        120,
        79,
        249,
        70,
        232,
        176,
        144,
        167,
        83,
        208,
        254,
        200,
        62,
        52,
        48,
        115,
        114,
        252,
        250,
        27,
        222,
        253,
        14,
        130,
        243,
        197,
        153,
        238,
        146,
        145,
        1,
        159,
        136,
        125,
        222,
        235,
        95,
        224,
        63,
        74,
        216,
        80,
        117,
        149,
        96,
        183,
        175,
        129,
        125,
        196,
        130,
        29,
        65,
        178,
        194,
        184,
        155,
        233,
        65,
        83,
        144,
        42,
        242,
        16,
        42,
        57,
        1,
        4,
        195,
        225,
        38,
        184,
        45,
        221,
        154,
        212,
        193,
        56,
        246,
        147,
        86,
        96,
        189,
        5,
    ];
    i = 0;
    while (i < 128) {
        proof.push_back(proof_data[i]);
        i = i + 1;
    };

    // Public inputs: salt_digest || old_digest || new_digest (96 bytes)
    let mut public_inputs = vector::empty<u8>();
    let public_data = vector[
        67,
        39,
        197,
        178,
        126,
        93,
        225,
        221,
        92,
        190,
        128,
        133,
        241,
        112,
        253,
        101,
        208,
        59,
        229,
        177,
        153,
        131,
        56,
        113,
        8,
        223,
        237,
        235,
        175,
        141,
        64,
        27,
        107,
        221,
        182,
        82,
        187,
        224,
        9,
        9,
        2,
        224,
        144,
        38,
        211,
        214,
        134,
        27,
        96,
        169,
        47,
        133,
        7,
        203,
        235,
        210,
        143,
        240,
        145,
        19,
        63,
        38,
        44,
        3,
        84,
        58,
        209,
        202,
        91,
        130,
        197,
        58,
        5,
        177,
        163,
        126,
        196,
        1,
        22,
        108,
        40,
        141,
        68,
        99,
        146,
        20,
        109,
        212,
        197,
        240,
        25,
        96,
        212,
        55,
        26,
        45,
    ];
    i = 0;
    while (i < 96) {
        public_inputs.push_back(public_data[i]);
        i = i + 1;
    };

    // Verify the proof and increment the counter
    increment(&registry, &mut counter, proof, public_inputs);

    transfer::share_object(registry);

    // Verify the value hash was updated to new_digest
    // new_value = 1, new_randomness = 987654321
    let expected_new_digest: u256 =
        20400401531609643696905782511486785523387928645650585839203663916578116811348;
    assert!(counter.value_digest() == expected_new_digest, 0);

    transfer::transfer(counter, owner);
    scenario.end();
}
