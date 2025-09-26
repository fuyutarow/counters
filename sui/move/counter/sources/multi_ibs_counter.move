// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/// Seal Shard Counter with BLS signature aggregation
///
/// This module implements a counter protected by Seal Shard signatures
/// with BLS signature aggregation for gas efficiency.
///
/// Key features:
/// - Direct storage of Seal Shard public keys (bypasses Key Server ownership issues)
/// - Aggregated signature verification (2 pairings for any number of signatures)
/// - Threshold-based authorization (t-of-n signatures required)
///
/// Flow:
/// 1. Create SealShardConfig with public keys and threshold
/// 2. Share SealShardCounter linked to config
/// 3. Collect signatures from Seal Key Servers off-chain
/// 4. Aggregate G1 signatures off-chain
/// 5. Verify aggregated signature on-chain and mint proof
/// 6. Use proof to increment counter
///
/// Gas efficiency:
/// - Traditional: n signatures = 2n pairings
/// - This implementation: n signatures = 2 pairings + (n-1) G2 additions

module counter::multi_ibs_counter;

use sui::{
    bcs,
    bls12381::{
        G2,
        g1_from_bytes,
        g2_from_bytes,
        g2_add,
        g2_identity,
        g2_generator,
        hash_to_g1,
        pairing
    },
    group_ops::Element,
    table::{Table, new}
};

// === Constants ===
const DOMAIN_SEPARATOR_BLS: vector<u8> = b"SUI-MULTI-IBS-V1";

// === Errors ===
#[error]
const EInvalidThreshold: vector<u8> = b"Invalid threshold: must be between 1 and seal shard count";

#[error]
const EInsufficientSignatures: vector<u8> = b"Contributor count below required threshold";

#[error]
const EDuplicateSealShard: vector<u8> = b"Duplicate seal shard detected";

#[error]
const ESealShardNotRegistered: vector<u8> = b"Seal shard not registered in counter configuration";

#[error]
const ESignatureVerificationFailed: vector<u8> = b"BLS signature verification failed";

#[error]
const ECounterMismatch: vector<u8> = b"Counter ID mismatch";

#[error]
const ESealShardAlreadyIncluded: vector<u8> = b"Seal shard already included in aggregation";

#[error]
const EInvalidID: vector<u8> =
    b"Invalid ID: does not match expected counter_id || signer_address format";

#[error]
const ELengthMismatch: vector<u8> = b"Seal shard IDs and public keys vectors must have same length";

// === Structs ===

/// Configuration for Seal Shard verification
/// Stores public keys in Table mapped by Key Server ID
public struct SealShardConfig has store {
    seal_shard_table: Table<ID, Element<G2>>, // Key Server ID → Public Key
    threshold: u64, // Minimum required signatures (t)
}

/// Counter protected by Seal Shard aggregated signatures
public struct SealShardCounter has key {
    id: UID,
    value: u64,
    config: SealShardConfig, // Embedded config for simplicity
}

/// One-time proof token for counter operations
/// Prevents replay attacks by consuming proof after use
public struct SealShardProof has key {
    id: UID,
    counter_id: ID,
    verified_signer_count: u64, // Number of signatures verified
}

/// Aggregated public key for BLS signature verification
public struct AggregatedSealShardKey has key {
    id: UID,
    /// Accumulated public key in G2 group
    public_key_g2: Element<G2>,
    /// ID of the associated counter
    counter_id: ID,
    /// Number of seal shards included in aggregation
    seal_shard_count: u64,
    /// Seal shard IDs already included (for duplicate prevention)
    included_seal_shard_ids: vector<ID>,
}

// === Public Functions ===

/// Create and share Seal Shard counter with embedded configuration
public fun share(
    seal_shard_ids: vector<ID>,
    seal_shard_pubkeys: vector<vector<u8>>,
    threshold: u64,
    ctx: &mut TxContext,
) {
    // Check input validation
    assert!(seal_shard_ids.length() == seal_shard_pubkeys.length(), ELengthMismatch);
    assert_all_unique(&seal_shard_ids);

    let n = seal_shard_ids.length();
    assert!(threshold > 0, EInvalidThreshold);
    assert!(threshold <= n, EInvalidThreshold);

    // Create table and populate with ID → public key mappings
    let mut seal_shard_table = new<ID, Element<G2>>(ctx);
    let mut i = 0;
    while (i < n) {
        let seal_shard_id = seal_shard_ids[i];
        let seal_shard_pubkey_g2 = g2_from_bytes(&seal_shard_pubkeys[i]);
        seal_shard_table.add(seal_shard_id, seal_shard_pubkey_g2);
        i = i + 1;
    };

    let config = SealShardConfig {
        seal_shard_table,
        threshold,
    };

    let counter = SealShardCounter {
        id: object::new(ctx),
        value: 0,
        config,
    };

    transfer::share_object(counter);
}

/// Verify aggregated signature and create one-time proof token
/// This is the core function that performs BLS signature aggregation verification
public fun verify_and_create_proof(
    counter: &SealShardCounter,
    aggregated_key: &AggregatedSealShardKey,
    signature_g1_bytes: vector<u8>,
    message: vector<u8>,
    ctx: &mut TxContext,
): SealShardProof {
    // Check threshold requirement using authenticated seal shard count
    assert!(aggregated_key.seal_shard_count >= counter.config.threshold, EInsufficientSignatures);

    // Verify the aggregated signature against authenticated aggregated key
    assert!(
        verify_bls_signature(
            &signature_g1_bytes,
            &message,
            aggregated_key,
        ),
        ESignatureVerificationFailed,
    );

    SealShardProof {
        id: object::new(ctx),
        counter_id: object::id(counter),
        verified_signer_count: aggregated_key.seal_shard_count,
    }
}

/// Increment counter using proof token
public fun increment(counter: &mut SealShardCounter, proof: SealShardProof) {
    let SealShardProof { id, counter_id, verified_signer_count: _ } = proof;

    assert!(counter_id == object::id(counter), ECounterMismatch);
    counter.value = counter.value + 1;

    object::delete(id); // Consume proof to prevent replay
}

/// Creates a new aggregated seal shard key associated with a counter
public fun new_aggregated_seal_shard_key(
    counter: &SealShardCounter,
    ctx: &mut TxContext,
): AggregatedSealShardKey {
    AggregatedSealShardKey {
        id: object::new(ctx),
        public_key_g2: g2_identity(),
        counter_id: object::id(counter),
        seal_shard_count: 0,
        included_seal_shard_ids: vector[],
    }
}

/// Add a seal shard's public key to the aggregated key
public fun aggregate_seal_shard_pubkey(
    counter: &SealShardCounter,
    aggregated_key: &mut AggregatedSealShardKey,
    seal_shard_id: ID,
) {
    // Counter ID verification
    assert!(object::id(counter) == aggregated_key.counter_id, ECounterMismatch);

    // Check if seal shard ID is registered in counter config
    assert!(counter.config.seal_shard_table.contains(seal_shard_id), ESealShardNotRegistered);

    // Check for duplicate addition
    assert!(
        !aggregated_key.included_seal_shard_ids.contains(&seal_shard_id),
        ESealShardAlreadyIncluded,
    );

    // Get the public key from table and add to aggregated key
    let seal_shard_pubkey_g2 = &counter.config.seal_shard_table[seal_shard_id];
    aggregated_key.public_key_g2 = g2_add(&aggregated_key.public_key_g2, seal_shard_pubkey_g2);

    // Record this seal shard ID as included and increment count
    aggregated_key.included_seal_shard_ids.push_back(seal_shard_id);
    aggregated_key.seal_shard_count = aggregated_key.seal_shard_count + 1;
}

// === Private Functions ===

/// Ensure all elements in the vector are unique
fun assert_all_unique<T: drop + copy>(items: &vector<T>) {
    items.length().do!(|i| {
        let (found, j) = items.index_of(&items[i]);
        assert!(found && i == j, EDuplicateSealShard);
    });
}

/// Verify BLS signature using pairing equation
/// e(signature_g1, generator_g2) = e(message_hash_g1, public_key_g2)
fun verify_bls_signature(
    signature_g1_bytes: &vector<u8>,
    message: &vector<u8>,
    aggregated_key: &AggregatedSealShardKey,
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

public fun value(self: &SealShardCounter): u64 {
    self.value
}

public fun threshold(self: &SealShardCounter): u64 {
    self.config.threshold
}

public fun seal_shard_count(self: &SealShardCounter): u64 {
    self.config.seal_shard_table.length()
}

public fun seal_shard_table(self: &SealShardCounter): &Table<ID, Element<G2>> {
    &self.config.seal_shard_table
}

// === AggregatedSealShardKey View Functions ===

/// Get the aggregated G2 public key
public fun public_key_g2(self: &AggregatedSealShardKey): &Element<G2> {
    &self.public_key_g2
}

/// Get the counter ID associated with this aggregated key
public fun aggregated_key_counter_id(self: &AggregatedSealShardKey): ID {
    self.counter_id
}

/// Get the seal shard IDs included in the aggregation
public fun included_seal_shard_ids(self: &AggregatedSealShardKey): &vector<ID> {
    &self.included_seal_shard_ids
}

/// Get the count of seal shards included in the aggregation
public fun included_seal_shard_count(self: &AggregatedSealShardKey): u64 {
    self.included_seal_shard_ids.length()
}

/// Destroy AggregatedSealShardKey object
public fun destroy_aggregated_seal_shard_key(key: AggregatedSealShardKey) {
    let AggregatedSealShardKey {
        id,
        public_key_g2: _,
        counter_id: _,
        seal_shard_count: _,
        included_seal_shard_ids: _,
    } = key;
    object::delete(id);
}

/// Destroy SealShardProof object (for testing only)
#[test_only]
public fun test_destroy_proof(proof: SealShardProof) {
    let SealShardProof {
        id,
        counter_id: _,
        verified_signer_count: _,
    } = proof;
    object::delete(id);
}

// === Seal Integration Functions ===

/// Seal approve function for Seal Shard counter access
/// InnerID structure: counter_id || signer_address
entry fun seal_approve(id: vector<u8>, counter: &SealShardCounter, _ctx: &TxContext) {
    // Construct expected InnerID: counter_id || signer_address
    let mut expected_inner_id = object::id(counter).to_bytes();
    let signer_bytes = bcs::to_bytes(&_ctx.sender());
    expected_inner_id.append(signer_bytes);

    // Verify the provided ID matches expected InnerID
    assert!(id == expected_inner_id, EInvalidID);
}

// === Test Helper Functions ===

#[test_only]
public fun test_create_counter(
    seal_shard_ids: vector<ID>,
    seal_shard_pubkey_bytes: vector<vector<u8>>,
    threshold: u64,
    ctx: &mut TxContext,
): SealShardCounter {
    let mut seal_shard_table = new<ID, Element<G2>>(ctx);
    let mut i = 0;
    while (i < seal_shard_ids.length()) {
        let seal_shard_id = seal_shard_ids[i];
        let seal_shard_pubkey_g2 = g2_from_bytes(&seal_shard_pubkey_bytes[i]);
        seal_shard_table.add(seal_shard_id, seal_shard_pubkey_g2);
        i = i + 1;
    };

    let config = SealShardConfig {
        seal_shard_table,
        threshold,
    };

    SealShardCounter {
        id: object::new(ctx),
        value: 0,
        config,
    }
}

#[test_only]
public fun test_destroy_counter(counter: SealShardCounter) {
    let SealShardCounter { id, value: _, config } = counter;
    let SealShardConfig { seal_shard_table, threshold: _ } = config;

    // For testing, we assume the table might not be empty
    // In practice, dropping the table will handle cleanup automatically
    seal_shard_table.drop();
    object::delete(id);
}

/// Test helper: Create proof without signature verification
#[test_only]
public fun test_create_proof(
    counter: &SealShardCounter,
    verified_signer_count: u64,
    ctx: &mut TxContext,
): SealShardProof {
    SealShardProof {
        id: object::new(ctx),
        counter_id: object::id(counter),
        verified_signer_count,
    }
}
