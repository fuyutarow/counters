// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/// Pedersen Commitment Counter using homomorphic properties
///
/// This counter uses Pedersen commitments to hide the actual counter value
/// while allowing homomorphic addition through elliptic curve operations.
///
/// Commitment: C = value * G + blinding * H
/// Where G and H are generators on the BLS12-381 G1 curve
///
/// Homomorphic property: C1 + C2 = (v1 + v2) * G + (r1 + r2) * H
/// This allows incrementing the counter without revealing the value.
module counter::pedersen_counter;

use sui::{bls12381::{Self, Scalar, G1}, group_ops::Element};

// === Structs ===

/// A counter using Pedersen commitment for privacy
public struct PedersenCounter has key, store {
    id: UID,
    /// The commitment to the counter value: C = value * G + blinding * H
    commitment: Element<G1>,
}

// === Public Functions ===

/// Create a new Pedersen counter with initial commitment
/// @param commitment_bytes: Serialized G1 point (48 bytes compressed)
public fun new(commitment_bytes: vector<u8>, ctx: &mut TxContext): PedersenCounter {
    PedersenCounter {
        id: object::new(ctx),
        commitment: bls12381::g1_from_bytes(&commitment_bytes),
    }
}

/// Increment the counter homomorphically by adding a commitment
/// @param value_commitment_bytes: Serialized G1 point (48 bytes compressed)
/// C_new = C_old + C_inc
public fun increment(self: &mut PedersenCounter, value_commitment_bytes: vector<u8>) {
    let increment_commitment = bls12381::g1_from_bytes(&value_commitment_bytes);
    self.commitment = bls12381::g1_add(&self.commitment, &increment_commitment);
}

// === View Functions ===

/// Get the commitment bytes for external verification (48 bytes compressed)
public fun commitment_bytes(self: &PedersenCounter): vector<u8> {
    *self.commitment.bytes()
}

// === Test-only Functions ===

#[test_only]
/// Get the second generator H by hashing a known string to G1
fun get_second_generator(): Element<G1> {
    let seed = b"PEDERSEN_COUNTER_SECOND_GENERATOR";
    bls12381::hash_to_g1(&seed)
}

#[test_only]
/// Create a commitment to a value with a blinding factor (for testing)
public fun commit(value: u64, blinding: &Element<Scalar>): Element<G1> {
    let g = bls12381::g1_generator();
    let h = get_second_generator();

    let value_scalar = bls12381::scalar_from_u64(value);
    let value_g = bls12381::g1_mul(&value_scalar, &g);
    let blinding_h = bls12381::g1_mul(blinding, &h);

    bls12381::g1_add(&value_g, &blinding_h)
}

#[test_only]
/// Verify that a commitment opens to a specific value
public fun verify_opening(commitment: &Element<G1>, value: u64, blinding: &Element<Scalar>): bool {
    let expected = commit(value, blinding);
    sui::group_ops::equal(commitment, &expected)
}

#[test_only]
/// Verify that a counter opens to a specific value
public fun verify_counter_value(
    self: &PedersenCounter,
    value: u64,
    blinding: &Element<Scalar>,
): bool {
    verify_opening(&self.commitment, value, blinding)
}

#[test_only]
public fun destroy_for_testing(counter: PedersenCounter) {
    let PedersenCounter { id, commitment: _ } = counter;
    object::delete(id);
}
