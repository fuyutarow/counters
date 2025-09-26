// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/// Multi-IBS Counter with BLS signature aggregation
///
/// This module implements a counter protected by multiple Identity-Based Signatures (IBS)
/// with BLS signature aggregation for gas efficiency.
///
/// Key features:
/// - Aggregated signature verification (2 pairings for any number of signatures)
/// - Dynamic Key Server reference via Seal Server infrastructure
/// - Threshold-based authorization (t-of-n signatures required)
///
/// Flow:
/// 1. Create MultiIBSConfig with Key Server IDs and threshold
/// 2. Share MultiIBSCounter linked to config
/// 3. Collect signatures from Key Servers off-chain
/// 4. Aggregate G1 signatures off-chain
/// 5. Verify aggregated signature on-chain and mint proof
/// 6. Use proof to increment counter
///
/// Gas efficiency:
/// - Traditional: n signatures = 2n pairings
/// - This implementation: n signatures = 2 pairings + (n-1) G2 additions

module counter::multi_ibs_counter;

use seal::key_server::KeyServer;
use sui::{
    bls12381::{G2, g1_from_bytes, g2_add, g2_identity, g2_generator, hash_to_g1, pairing},
    group_ops::Element
};

// === Constants ===
const DST_DERIVE_KEY: vector<u8> = b"SUI-MULTI-IBS-V1";

// === Errors ===
#[error]
const EInvalidThreshold: vector<u8> = b"Threshold must be between 1 and total key servers";

#[error]
const EInsufficientSignatures: vector<u8> = b"Insufficient signatures for threshold";

#[error]
const EDuplicateSigner: vector<u8> = b"Duplicate signer index detected";

#[error]
const EInvalidSignerIndex: vector<u8> = b"Signer index out of bounds";

#[error]
const EInvalidSignature: vector<u8> = b"Aggregated signature verification failed";

#[error]
const ECounterMismatch: vector<u8> = b"Proof does not match counter";

// === Structs ===

/// Configuration for Multi-IBS verification
/// Links to Seal Key Server objects for dynamic public key retrieval
public struct MultiIBSConfig has store {
    key_server_ids: vector<ID>, // Seal Key Server object IDs
    threshold: u64, // Minimum required signatures (t)
}

/// Counter protected by Multi-IBS aggregated signatures
public struct MultiIBSCounter has key {
    id: UID,
    value: u64,
    config: MultiIBSConfig, // Embedded config for simplicity
}

/// One-time proof token for counter operations
/// Prevents replay attacks by consuming proof after use
public struct MultiIBSProof has key {
    id: UID,
    counter_id: ID,
    verified_signer_count: u64, // Number of signatures verified
}

public struct AggregatedPublicKey has key {
    id: UID,
    pk: Element<G2>, // Aggregated G2 public key
    counter: ID, // Reference to associated counter
}

/// Aggregated signature data submitted by client
public struct AggregatedSignature has drop {
    signature_g1: vector<u8>, // Aggregated G1 signature (48 bytes)
    signer_indices: vector<u32>, // Indices of Key Servers that signed
    message: vector<u8>, // Original message that was signed
}

// === Public Functions ===

/// Create and share Multi-IBS counter with embedded config
public fun share(key_server_ids: vector<ID>, threshold: u64, ctx: &mut TxContext) {
    let n = key_server_ids.length();
    assert!(n > 0, EInvalidThreshold);
    assert!(threshold > 0 && threshold <= n, EInvalidThreshold);

    let config = MultiIBSConfig {
        key_server_ids,
        threshold,
    };

    let counter = MultiIBSCounter {
        id: object::new(ctx),
        value: 0,
        config,
    };

    transfer::share_object(counter);
}

/// Verify aggregated signature and mint proof token
/// This is the core function that performs BLS signature aggregation verification
public fun verify_and_mint_proof(
    counter: &MultiIBSCounter,
    aggregated_pk: &AggregatedPublicKey,
    aggregated_sig: AggregatedSignature,
    ctx: &mut TxContext,
): MultiIBSProof {
    let signer_count = aggregated_sig.signer_indices.length();

    // Check threshold requirement
    assert!(signer_count >= counter.config.threshold, EInsufficientSignatures);

    // Verify no duplicate signers and indices are valid
    verify_signer_indices(&aggregated_sig.signer_indices, counter.config.key_server_ids.length());

    // Verify the aggregated signature
    assert!(
        verify_aggregated_bls_signature(
            &aggregated_sig.signature_g1,
            &aggregated_sig.message,
            aggregated_pk,
        ),
        EInvalidSignature,
    );

    MultiIBSProof {
        id: object::new(ctx),
        counter_id: object::id(counter),
        verified_signer_count: signer_count,
    }
}

/// Increment counter using proof token
public fun increment(counter: &mut MultiIBSCounter, proof: MultiIBSProof) {
    let MultiIBSProof { id, counter_id, verified_signer_count: _ } = proof;

    assert!(counter_id == object::id(counter), ECounterMismatch);
    counter.value = counter.value + 1;

    object::delete(id); // Consume proof to prevent replay
}

public fun new_public_key(counter: &MultiIBSCounter, ctx: &mut TxContext): AggregatedPublicKey {
    AggregatedPublicKey {
        id: object::new(ctx),
        pk: g2_identity(),
        counter: object::id(counter),
    }
}

public fun insert_key_server_pk(
    counter: &MultiIBSCounter,
    aggregated_pk: &mut AggregatedPublicKey,
    key_serve: &KeyServer,
) {
    assert!(object::id(counter) == aggregated_pk.counter, ECounterMismatch);

    assert!(counter.config.key_server_ids.contains(&object::id(key_serve)), EInvalidSignerIndex);

    // Add the key server's public key to the aggregated key
    aggregated_pk.pk = g2_add(&aggregated_pk.pk, &key_serve.pk_as_bf_bls12381());
}

// === Private Functions ===

/// Verify BLS aggregated signature using pairing
/// e(σ_agg, G2_gen) = e(H(ID || DST || message), pk_agg)
fun verify_aggregated_bls_signature(
    signature_bytes: &vector<u8>,
    message: &vector<u8>,
    aggregated_pk: &AggregatedPublicKey,
): bool {
    // Parse aggregated signature
    let sig_g1 = g1_from_bytes(signature_bytes);

    // Prepare message with domain separation (ID is implicit in the signature verification)
    let mut full_message = vector[];
    full_message.append(DST_DERIVE_KEY);
    full_message.append(*message);

    // Hash to G1
    let msg_hash_g1 = hash_to_g1(&full_message);

    // Verify pairing equation: e(σ, G2_gen) = e(H(DST || m), pk_agg)
    let lhs = pairing(&sig_g1, &g2_generator());
    let rhs = pairing(&msg_hash_g1, &aggregated_pk.pk);

    lhs == rhs
}

/// Verify signer indices are valid and unique
fun verify_signer_indices(indices: &vector<u32>, max_index: u64) {
    let mut seen = vector[];

    indices.do_ref!(|idx| {
        // Check bounds
        assert!((*idx as u64) < max_index, EInvalidSignerIndex);

        // Check for duplicates
        assert!(!seen.contains(idx), EDuplicateSigner);
        seen.push_back(*idx);
    });
}

// === View Functions ===

public fun value(self: &MultiIBSCounter): u64 {
    self.value
}

public fun threshold(self: &MultiIBSCounter): u64 {
    self.config.threshold
}

public fun total_key_servers(self: &MultiIBSCounter): u64 {
    self.config.key_server_ids.length()
}

public fun key_server_ids(self: &MultiIBSCounter): &vector<ID> {
    &self.config.key_server_ids
}

// === Test Helper Functions ===

#[test_only]
public fun test_create_aggregated_signature(
    signature_g1: vector<u8>,
    signer_indices: vector<u32>,
    message: vector<u8>,
): AggregatedSignature {
    AggregatedSignature {
        signature_g1,
        signer_indices,
        message,
    }
}

#[test_only]
public fun test_create_counter(
    key_server_ids: vector<ID>,
    threshold: u64,
    ctx: &mut TxContext,
): MultiIBSCounter {
    let config = MultiIBSConfig {
        key_server_ids,
        threshold,
    };

    MultiIBSCounter {
        id: object::new(ctx),
        value: 0,
        config,
    }
}

#[test_only]
public fun test_destroy_counter(counter: MultiIBSCounter) {
    let MultiIBSCounter { id, value: _, config: _ } = counter;
    object::delete(id);
}
