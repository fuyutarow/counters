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
const DOMAIN_SEPARATOR_BLS: vector<u8> = b"SUI-MULTI-IBS-V1";

// === Errors ===
#[error]
const EInvalidThreshold: vector<u8> = b"Invalid threshold: must be between 1 and key server count";

#[error]
const EInsufficientSignatures: vector<u8> = b"Contributor count below required threshold";

#[error]
const EDuplicateKeyServer: vector<u8> = b"Duplicate key server detected";

#[error]
const EKeyServerNotRegistered: vector<u8> = b"Key server not registered in counter configuration";

#[error]
const ESignatureVerificationFailed: vector<u8> = b"BLS signature verification failed";

#[error]
const ECounterMismatch: vector<u8> = b"Counter ID mismatch";

#[error]
const EKeyServerAlreadyIncluded: vector<u8> = b"Key server already included in aggregation";

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

/// Aggregated public key for BLS signature verification
public struct AggregatedPublicKey has key {
    id: UID,
    /// Accumulated public key in G2 group
    public_key_g2: Element<G2>,
    /// ID of the associated counter
    counter_id: ID,
    /// Number of key servers included in aggregation
    key_server_count: u64,
    /// Key servers already included (for duplicate prevention only)
    included_key_server_ids: vector<ID>,
}

/// Single aggregated BLS signature from multiple key servers
public struct AggregatedSignature has drop {
    /// Aggregated BLS signature in G1 (48 bytes compressed)
    signature_g1: vector<u8>,
    /// Original message that was signed
    message: vector<u8>,
}

// === Public Functions ===

/// Create and share Multi-IBS counter with embedded configuration
public fun share(key_server_ids: vector<ID>, threshold: u64, ctx: &mut TxContext) {
    // Check for duplicate key server IDs
    assert_all_unique(&key_server_ids);

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

/// Verify aggregated signature and create one-time proof token
/// This is the core function that performs BLS signature aggregation verification
public fun verify_and_create_proof(
    counter: &MultiIBSCounter,
    aggregated_key: &AggregatedPublicKey,
    aggregated_signature: AggregatedSignature,
    ctx: &mut TxContext,
): MultiIBSProof {
    // Check threshold requirement using authenticated key server count
    assert!(aggregated_key.key_server_count >= counter.config.threshold, EInsufficientSignatures);

    // Verify the aggregated signature against authenticated aggregated key
    assert!(
        verify_bls_signature(
            &aggregated_signature.signature_g1,
            &aggregated_signature.message,
            aggregated_key,
        ),
        ESignatureVerificationFailed,
    );

    MultiIBSProof {
        id: object::new(ctx),
        counter_id: object::id(counter),
        verified_signer_count: aggregated_key.key_server_count,
    }
}

/// Increment counter using proof token
public fun increment(counter: &mut MultiIBSCounter, proof: MultiIBSProof) {
    let MultiIBSProof { id, counter_id, verified_signer_count: _ } = proof;

    assert!(counter_id == object::id(counter), ECounterMismatch);
    counter.value = counter.value + 1;

    object::delete(id); // Consume proof to prevent replay
}


/// Creates a new aggregated public key associated with a counter
public fun new_aggregated_public_key(
    counter: &MultiIBSCounter,
    ctx: &mut TxContext,
): AggregatedPublicKey {
    AggregatedPublicKey {
        id: object::new(ctx),
        public_key_g2: g2_identity(),
        counter_id: object::id(counter),
        key_server_count: 0,
        included_key_server_ids: vector[],
    }
}

/// Add a key server's public key to the aggregated key
public fun add_key_server_public_key(
    counter: &MultiIBSCounter,
    aggregated_key: &mut AggregatedPublicKey,
    key_server: &KeyServer,
) {
    let key_server_id = object::id(key_server);

    // Counter ID verification
    assert!(object::id(counter) == aggregated_key.counter_id, ECounterMismatch);

    // Check if Key Server is registered in counter config
    assert!(counter.config.key_server_ids.contains(&key_server_id), EKeyServerNotRegistered);

    // Check for duplicate addition
    assert!(
        !aggregated_key.included_key_server_ids.contains(&key_server_id),
        EKeyServerAlreadyIncluded,
    );

    // Add the key server's public key to the aggregated key
    aggregated_key.public_key_g2 =
        g2_add(&aggregated_key.public_key_g2, &key_server.pk_as_bf_bls12381());

    // Record this Key Server as included and increment count
    aggregated_key.included_key_server_ids.push_back(key_server_id);
    aggregated_key.key_server_count = aggregated_key.key_server_count + 1;
}

// === Private Functions ===

/// Ensure all elements in the vector are unique
fun assert_all_unique<T: drop + copy>(items: &vector<T>) {
    items.length().do!(|i| {
        let (found, j) = items.index_of(&items[i]);
        assert!(found && i == j, EDuplicateKeyServer);
    });
}

/// Verify BLS signature using pairing equation
/// e(signature_g1, generator_g2) = e(message_hash_g1, public_key_g2)
fun verify_bls_signature(
    signature_g1_bytes: &vector<u8>,
    message: &vector<u8>,
    aggregated_key: &AggregatedPublicKey,
): bool {
    // Parse signature from G1 bytes
    let signature_g1 = g1_from_bytes(signature_g1_bytes);

    // Prepare message with domain separation
    let mut message_with_domain = vector[];
    message_with_domain.append(DOMAIN_SEPARATOR_BLS);
    message_with_domain.append(*message);

    // Hash message to G1 point
    let message_hash_g1 = hash_to_g1(&message_with_domain);

    // Verify pairing equation: e(sig_g1, gen_g2) = e(hash_g1, pk_g2)
    let signature_pairing = pairing(&signature_g1, &g2_generator());
    let message_pairing = pairing(&message_hash_g1, &aggregated_key.public_key_g2);

    signature_pairing == message_pairing
}

// === View Functions ===

public fun value(self: &MultiIBSCounter): u64 {
    self.value
}

public fun threshold(self: &MultiIBSCounter): u64 {
    self.config.threshold
}

public fun key_server_count(self: &MultiIBSCounter): u64 {
    self.config.key_server_ids.length()
}

public fun key_server_ids(self: &MultiIBSCounter): &vector<ID> {
    &self.config.key_server_ids
}

// === AggregatedPublicKey View Functions ===

/// Get the aggregated G2 public key
public fun public_key_g2(self: &AggregatedPublicKey): &Element<G2> {
    &self.public_key_g2
}

/// Get the counter ID associated with this aggregated key
public fun aggregated_key_counter_id(self: &AggregatedPublicKey): ID {
    self.counter_id
}

/// Get the IDs of key servers included in the aggregation
public fun included_key_server_ids(self: &AggregatedPublicKey): &vector<ID> {
    &self.included_key_server_ids
}

/// Get the count of key servers included in the aggregation
public fun included_key_server_count(self: &AggregatedPublicKey): u64 {
    self.included_key_server_ids.length()
}

/// Destroy AggregatedPublicKey object
public fun destroy_aggregated_public_key(key: AggregatedPublicKey) {
    let AggregatedPublicKey {
        id,
        public_key_g2: _,
        counter_id: _,
        key_server_count: _,
        included_key_server_ids: _,
    } = key;
    object::delete(id);
}

/// Destroy MultiIBSProof object (for testing only)
#[test_only]
public fun test_destroy_proof(proof: MultiIBSProof) {
    let MultiIBSProof {
        id,
        counter_id: _,
        verified_signer_count: _,
    } = proof;
    object::delete(id);
}

// === Test Helper Functions ===

#[test_only]
public fun test_create_aggregated_signature(
    signature_g1: vector<u8>,
    message: vector<u8>,
): AggregatedSignature {
    AggregatedSignature {
        signature_g1,
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
    let MultiIBSCounter { id, value: _, config } = counter;
    let MultiIBSConfig { key_server_ids: _, threshold: _ } = config;
    object::delete(id);
}

/// Test helper: Create mock Key Server for testing
/// This bypasses the Seal integration and creates a minimal object for testing PTB flow
#[test_only]
public fun test_create_mock_key_server(ctx: &mut TxContext): ID {
    // Create a simple object that can be used as a Key Server placeholder
    let id = object::new(ctx);
    let object_id = object::uid_to_inner(&id);

    // Delete the UID since we just need the ID
    object::delete(id);

    object_id
}

/// Test helper: Create proof without signature verification
#[test_only]
public fun test_create_proof(
    counter: &MultiIBSCounter,
    verified_signer_count: u64,
    ctx: &mut TxContext,
): MultiIBSProof {
    MultiIBSProof {
        id: object::new(ctx),
        counter_id: object::id(counter),
        verified_signer_count,
    }
}
