// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/// Test helper functions for Seal Shard counter testing
/// These functions bypass Key Server object requirements for testing purposes
module counter::test_seal_shard;

use counter::multi_ibs_counter::SealShardCounter;
use sui::{
    bls12381::{G2, g1_from_bytes, g2_from_bytes, g2_generator, hash_to_g1, pairing},
    group_ops::Element
};

// === Constants ===
const DOMAIN_SEPARATOR_BLS: vector<u8> = b"SUI-SEAL-SHARD-V1";

/// Test-only verification function that accepts aggregated public key directly
/// This bypasses the complex Key Server object management for testing
/// Returns true if signature is valid, false otherwise
public fun verify_with_aggregated_public_key(
    counter: &SealShardCounter,
    aggregated_public_key_g2_bytes: vector<u8>,
    signature_g1_bytes: vector<u8>,
    message: vector<u8>,
    seal_shard_count: u64,
): bool {
    // Check threshold requirement
    if (seal_shard_count < counter.threshold()) {
        return false
    };

    // Parse aggregated public key from bytes
    let aggregated_pk_g2 = g2_from_bytes(&aggregated_public_key_g2_bytes);

    // Verify the aggregated signature
    verify_bls_signature_direct(&signature_g1_bytes, &message, &aggregated_pk_g2)
}

/// Direct BLS signature verification with G2 public key
fun verify_bls_signature_direct(
    signature_g1_bytes: &vector<u8>,
    message: &vector<u8>,
    aggregated_public_key_g2: &Element<G2>,
): bool {
    // Parse signature from G1 bytes
    let signature_g1 = g1_from_bytes(signature_g1_bytes);

    // Prepare message with domain separation (same as main contract)
    let mut message_with_domain = vector[];
    message_with_domain.append(DOMAIN_SEPARATOR_BLS);
    message_with_domain.append(*message);

    // Hash message to G1 point
    let message_hash_g1 = hash_to_g1(&message_with_domain);

    // Verify pairing equation: e(sig_g1, gen_g2) = e(hash_g1, pk_g2)
    let signature_pairing = pairing(&signature_g1, &g2_generator());
    let message_pairing = pairing(&message_hash_g1, aggregated_public_key_g2);

    signature_pairing == message_pairing
}
