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

/// Verifying Key in Arkworks canonical compressed format (360 bytes)
///
/// Generation process:
/// 1. Create Circom circuit: circuits/private_counter.circom
///    - Inputs: salt (private), old_value (private)
///    - Public outputs: salt_digest, old_hash, new_hash
///    - Circuit enforces: new_value = old_value + 1
/// 2. Compile circuit: circom private_counter.circom --r1cs --wasm
/// 3. Generate powers of tau: snarkjs powersoftau new bn128 14 pot14_0000.ptau
/// 4. Generate zkey: snarkjs groth16 setup private_counter.r1cs pot14_final.ptau private_counter_0000.zkey
/// 5. Export verification key: snarkjs zkey export verificationkey private_counter_0000.zkey verification_key.json
/// 6. Serialize to Arkworks format using scripts/generate-vk-bytes.ts (calls serializeVerifyingKey())
///
/// This VK is fixed for the circuit and must match the circuit used to generate proofs
const VK_BYTES: vector<u8> =
    x"e2f26dbea299f5223b646cb1fb33eadb059d9407559d7441dfd902e3a79a4d2dabb73dc17fbc13021e2471e0c08bd67d8401f52b73d6d07483794cad4778180e0c06f33bbc4c79a9cadef253a68084d382f17788f885c9afd176f7cb2f036789edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e19e04b37ff1453531c06b257a883eadcd53f9b41b0446225939c99c97bfa07b70a9a8635cf7cef1354218be9b03790342519b55f466b1e56e91bc7322611329d1804000000000000000c3101e80ac97fa82eec135fe95afbcff9cf7befec8dfa277a12e36c219b1e82ed89332eab2b6ddd1bd0b9f861ce203022279b2be8d67d4fad77bf14d032a299eb8e9220072a52cb826a8ef6170a1f32f3eeeea760c653c54c1217e7125260af7d8be00252792fb955a5a874d0178f921553c53d0501a2378d7bc2f64e26788d";

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

/// A private counter that stores hashes instead of actual values.
/// The actual count value is never revealed on-chain.
/// This is a single-owner object - only the owner can increment it.
public struct PrivateCounter has key, store {
    id: UID,
    // ZK proof state
    salt_digest: u256, // Poseidon(salt) - fixed for this counter
    value_digest: u256, // Poseidon(value, salt) - changes as value increments
}

// === Public Functions ===

/// Returns the verifying key bytes for external package use
/// This allows other packages to verify proofs using the same VK
#[allow(implicit_const_copy)]
public fun vk_bytes(): vector<u8> {
    VK_BYTES
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
/// @param self: Mutable reference to the counter (owner only)
/// @param proof_bytes: Groth16 proof points (serialized)
/// @param public_inputs_bytes: Public inputs (salt_digest || h_old || h_new)
public fun increment(
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

    // 3. Verify ZK proof using VK constant
    let is_valid_proof = verify_increment_proof(
        &vk_bytes(),
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

    increment(&mut counter, dummy_proof, dummy_inputs);

    transfer::transfer(counter, owner);
    scenario.end();
}

#[test]
fun test_successful_increment_with_valid_proof() {
    let owner = @0xA;
    let mut scenario = test_scenario::begin(owner);

    // Initial values from Circom circuit test
    // old_value = 0, salt = 42
    // old_value_digest = Poseidon(0, 42)
    let initial_value_digest: u256 =
        9904646155488355737762297645225334693069781832889131634543122060982625196787;
    let salt_digest: u256 =
        12326503012965816391338144612242952408728683609716147019497703475006801258307; // Poseidon(42)

    let mut counter = new(initial_value_digest, salt_digest, scenario.ctx());

    // Real Groth16 proof in Arkworks compressed format (128 bytes)
    // Generated using:
    // 1. Input: { salt: "42", old_value: "0", old_randomness: "42", new_randomness: "42" }
    // 2. snarkjs groth16 fullprove input.json private_counter.wasm private_counter_final.zkey proof.json public.json
    // 3. Serialize proof to Arkworks format using convert-proof tool
    let proof =
        x"5e5e98ce059efe12c1c3e0fd0d94766b67664329e720e692e6cbbd9879a2559ac11862571f8b6cce8ec1d60f720c830752876640af6241bf55e58e4342e7e81ec77707ad6ecfd5b0d0c4c7c2226f06c26c972bfde2c8c2ef0acbf4da77747b85a7cdfbcb82e3f9acd68ad09582bec4a238c3fe6a1ceb3f3c4c5d2b098428e5ae";

    // Public inputs: salt_digest || old_digest || new_digest (96 bytes = 3 * 32 bytes)
    // BCS-encoded u256 values
    // salt_digest = Poseidon(42)
    // old_digest = Poseidon(0, 42)
    // new_digest = Poseidon(1, 42)
    let public_inputs =
        x"4327c5b27e5de1dd5cbe8085f170fd65d03be5b19983387108dfedebaf8d401bf35aab96a7d06db4ba901f1a783dd5a0cb70417fe5c0abb2e7113867c0d4e5152863fd9cd89b78affa94ad5e8d8de6572d9c9a4f9fe14a7c7061203d3bbab820";

    // Verify the proof and increment the counter
    increment(&mut counter, proof, public_inputs);

    // Verify the value hash was updated to new_digest
    // new_value = 1, new_digest = Poseidon(1, 42)
    let expected_new_digest: u256 =
        14800396336478473958655799498724128728735427661463011194055900610499073368872;
    assert!(counter.value_digest() == expected_new_digest, 0);

    transfer::transfer(counter, owner);
    scenario.end();
}
