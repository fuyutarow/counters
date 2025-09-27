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

use std::{bcs, type_name};
use sui::{
    address,
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
const SEAL_DST_ID: vector<u8> = b"SUI-SEAL-IBE-BLS12381-00";

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

/// Marker type for dynamic package ID extraction
public struct PackageMarker has drop {}

/// Configuration for Multi-IBS verification
/// Stores seal shard public keys in Table mapped by Key Server ID
public struct MultiIBSConfig has store {
    seal_shard_table: Table<ID, Element<G2>>, // Key Server ID → Seal Shard Public Key
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

    let config = MultiIBSConfig {
        seal_shard_table,
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
    signature_g1_bytes: vector<u8>,
    message: vector<u8>,
    ctx: &mut TxContext,
): MultiIBSProof {
    // Check threshold requirement using authenticated seal shard count
    assert!(aggregated_key.seal_shard_count >= counter.config.threshold, EInsufficientSignatures);

    // Verify the aggregated signature against authenticated aggregated key
    assert!(
        verify_bls_signature(
            &signature_g1_bytes,
            &message,
            aggregated_key,
            ctx.sender(),
        ),
        ESignatureVerificationFailed,
    );

    MultiIBSProof {
        id: object::new(ctx),
        counter_id: object::id(counter),
        verified_signer_count: aggregated_key.seal_shard_count,
    }
}

/// Increment counter using proof token
public fun increment(counter: &mut MultiIBSCounter, proof: MultiIBSProof) {
    let MultiIBSProof { id, counter_id, verified_signer_count: _ } = proof;

    assert!(counter_id == object::id(counter), ECounterMismatch);
    counter.value = counter.value + 1;

    object::delete(id); // Consume proof to prevent replay
}

/// Creates a new aggregated seal shard key associated with a counter
public fun new_aggregated_public_key(
    counter: &MultiIBSCounter,
    ctx: &mut TxContext,
): AggregatedPublicKey {
    AggregatedPublicKey {
        id: object::new(ctx),
        public_key_g2: g2_identity(),
        counter_id: object::id(counter),
        seal_shard_count: 0,
        included_seal_shard_ids: vector[],
    }
}

/// Add a seal shard's public key to the aggregated key
public fun aggregate_seal_shard_pubkey(
    counter: &MultiIBSCounter,
    aggregated_key: &mut AggregatedPublicKey,
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

/// Get current package ID dynamically using type reflection
public fun get_package_id_bytes(): vector<u8> {
    let addr: address = type_name::original_id<PackageMarker>();
    bcs::to_bytes(&addr)
}

/// Verify IBE-based BLS signature using pairing equation
/// e(signature_g1, generator_g2) = e(H₁(IBE_ID), public_key_g2)
/// where IBE_ID = counter_id || signer || domain || message
fun verify_bls_signature(
    signature_g1_bytes: &vector<u8>,
    message: &vector<u8>,
    aggregated_key: &AggregatedPublicKey,
    signer: address,
): bool {
    // Parse signature from G1 bytes
    let signature_g1 = g1_from_bytes(signature_g1_bytes);

    // Reconstruct IBE ID same as in seal_approve: counter_id || signer || domain || message
    let mut ibe_id = object::id_to_bytes(&aggregated_key.counter_id);
    let signer_bytes = address::to_bytes(signer);
    ibe_id.append(signer_bytes);

    // Prepare message with domain separation (same as in seal_approve)
    let mut message_with_domain = vector[];
    message_with_domain.append(DOMAIN_SEPARATOR_BLS);
    message_with_domain.append(*message);

    // Append domain + message to IBE ID
    ibe_id.append(message_with_domain);

    // Construct FullID: [PackageID][InnerID] (matching Seal SDK)
    // Seal SDK automatically prepends PackageID, so Move must do the same
    let package_id_bytes = get_package_id_bytes();
    let mut full_id = package_id_bytes;
    full_id.append(ibe_id);

    // Hash FullID to G1 using the same DST as Seal key derivation
    let mut ibe_hash_input = SEAL_DST_ID;
    ibe_hash_input.append(full_id);
    let ibe_hash_g1 = hash_to_g1(&ibe_hash_input);

    // Verify pairing equation: e(sig_g1, gen_g2) = e(H₁(IBE_ID), pk_g2)
    let signature_pairing = pairing(&signature_g1, &g2_generator());
    let message_pairing = pairing(&ibe_hash_g1, &aggregated_key.public_key_g2);

    signature_pairing == message_pairing
}

// === View Functions ===

public fun value(self: &MultiIBSCounter): u64 {
    self.value
}

public fun threshold(self: &MultiIBSCounter): u64 {
    self.config.threshold
}

public fun seal_shard_count(self: &MultiIBSCounter): u64 {
    self.config.seal_shard_table.length()
}

public fun seal_shard_table(self: &MultiIBSCounter): &Table<ID, Element<G2>> {
    &self.config.seal_shard_table
}

// === AggregatedSealShardKey View Functions ===

/// Get the aggregated G2 public key
public fun public_key_g2(self: &AggregatedPublicKey): &Element<G2> {
    &self.public_key_g2
}

/// Get the counter ID associated with this aggregated key
public fun aggregated_key_counter_id(self: &AggregatedPublicKey): ID {
    self.counter_id
}

/// Get the seal shard IDs included in the aggregation
public fun included_seal_shard_ids(self: &AggregatedPublicKey): &vector<ID> {
    &self.included_seal_shard_ids
}

/// Get the count of seal shards included in the aggregation
public fun included_seal_shard_count(self: &AggregatedPublicKey): u64 {
    self.included_seal_shard_ids.length()
}

/// Destroy AggregatedSealShardKey object
public fun destroy_aggregated_public_key(key: AggregatedPublicKey) {
    let AggregatedPublicKey {
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
public fun test_destroy_proof(proof: MultiIBSProof) {
    let MultiIBSProof {
        id,
        counter_id: _,
        verified_signer_count: _,
    } = proof;
    object::delete(id);
}

// === Seal Integration Functions ===

/// Seal approve function for Seal Shard counter access
/// InnerID structure: counter_id || signer_address || H(domain || message)
entry fun seal_approve(
    id: vector<u8>,
    counter: &MultiIBSCounter,
    message: vector<u8>,
    _ctx: &TxContext,
) {
    // Construct expected InnerID: counter_id || signer_address || H(domain || message)
    let mut expected_inner_id = object::id_to_bytes(&object::id(counter));
    let signer_bytes = address::to_bytes(_ctx.sender());
    expected_inner_id.append(signer_bytes);

    // Prepare message with domain separation matching BLS verification
    let mut message_with_domain = vector[];
    message_with_domain.append(DOMAIN_SEPARATOR_BLS);
    message_with_domain.append(message);

    // Include the raw message bytes instead of G1 hash
    // This maintains the ID uniqueness while avoiding G1 serialization issues
    expected_inner_id.append(message_with_domain);

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
): MultiIBSCounter {
    let mut seal_shard_table = new<ID, Element<G2>>(ctx);
    let mut i = 0;
    while (i < seal_shard_ids.length()) {
        let seal_shard_id = seal_shard_ids[i];
        let seal_shard_pubkey_g2 = g2_from_bytes(&seal_shard_pubkey_bytes[i]);
        seal_shard_table.add(seal_shard_id, seal_shard_pubkey_g2);
        i = i + 1;
    };

    let config = MultiIBSConfig {
        seal_shard_table,
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
    let MultiIBSConfig { seal_shard_table, threshold: _ } = config;

    // For testing, we assume the table might not be empty
    // In practice, dropping the table will handle cleanup automatically
    seal_shard_table.drop();
    object::delete(id);
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

/// Debug function to test ID construction with fixed values
#[test]
public fun test_debug_id_construction() {
    use std::debug;

    debug::print(&b"=== Move ID Construction Debug ===");

    // Use same fixed values as TypeScript debug script
    let counter_id_bytes = x"1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    let signer = @0x5678901234567890abcdef1234567890abcdef1234567890abcdef1234567890;
    let message = b"test-message";

    debug::print(&b"Fixed values:");
    debug::print(
        &b"Counter ID bytes: 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    );
    debug::print(&b"Signer: 5678901234567890abcdef1234567890abcdef1234567890abcdef1234567890");
    debug::print(&b"Message: test-message");

    // Step 1: Start with counter ID bytes (already in bytes)
    let mut ibe_id = counter_id_bytes;
    debug::print(&b"Step 1 - Counter ID bytes (32 bytes):");
    debug::print(&hex::encode(ibe_id));

    // Step 2: Append signer address bytes
    let signer_bytes = address::to_bytes(signer);
    ibe_id.append(signer_bytes);
    debug::print(&b"Step 2 - After appending signer (64 bytes):");
    debug::print(&hex::encode(ibe_id));

    // Step 3: Prepare message with domain separation
    let mut message_with_domain = vector[];
    message_with_domain.append(DOMAIN_SEPARATOR_BLS);
    message_with_domain.append(message);

    debug::print(&b"Step 3 - Message with domain:");
    debug::print(&b"Domain separator: SUI-MULTI-IBS-V1");
    debug::print(&hex::encode(DOMAIN_SEPARATOR_BLS));
    debug::print(&b"Message bytes:");
    debug::print(&hex::encode(message));
    debug::print(&b"Combined message with domain:");
    debug::print(&hex::encode(message_with_domain));

    // Step 4: Complete InnerID construction
    ibe_id.append(message_with_domain);
    debug::print(&b"Step 4 - InnerID construction:");
    debug::print(&b"Length (should be 92 bytes):");
    debug::print(&(ibe_id.length() as u64));
    debug::print(&b"InnerID hex:");
    debug::print(&hex::encode(ibe_id));

    // Step 5: Package address bytes
    let package_bytes = address::to_bytes(@counter);
    debug::print(&b"Step 5 - Package ID bytes (32 bytes):");
    debug::print(&hex::encode(package_bytes));

    // Step 6: FullID construction (package_id || inner_id)
    let mut full_id = package_bytes;
    full_id.append(ibe_id);
    debug::print(&b"Step 6 - FullID construction:");
    debug::print(&b"Length (should be 124 bytes):");
    debug::print(&(full_id.length() as u64));
    debug::print(&b"FullID hex:");
    debug::print(&hex::encode(full_id));

    // Step 7: Hash input for hash_to_g1
    let mut ibe_hash_input = SEAL_DST_ID;
    ibe_hash_input.append(full_id);
    debug::print(&b"Step 7 - Hash input for hash_to_g1:");
    debug::print(&b"SEAL DST: SUI-SEAL-IBE-BLS12381-00");
    debug::print(&hex::encode(SEAL_DST_ID));
    debug::print(&b"Hash input length (should be 148 bytes):");
    debug::print(&(ibe_hash_input.length() as u64));
    debug::print(&b"Hash input hex:");
    debug::print(&hex::encode(ibe_hash_input));

    debug::print(&b"=== Summary ===");
    debug::print(&b"InnerID (92 bytes):");
    debug::print(&hex::encode(ibe_id));
    debug::print(&b"FullID (124 bytes):");
    debug::print(&hex::encode(full_id));
    debug::print(&b"Hash input (148 bytes):");
    debug::print(&hex::encode(ibe_hash_input));
}
