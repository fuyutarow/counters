/// Seal IBE Multi-signature Counter with SEAL derived keys
///
/// This module protects a counter using **SEAL IBE-derived keys as signatures**
/// with public-key aggregation for gas efficiency. Threshold is enforced as a **policy**
/// (t-of-n verified signers), not as a cryptographic threshold scheme.
///
/// Key features:
/// - Store SEAL IBE public keys directly (PoP checked off-chain on registration)
/// - Verify aggregated derived signatures against aggregated public keys
///   using **pairing equations** instead of standard BLS verification
/// - **t-of-n policy**: require at least `threshold` distinct registered signers
///
/// Flow:
/// 1. Create `SealIbeMultisigConfig` with registered public keys (G2) and threshold
/// 2. Share `SealIbeMultisigCounter` linked to the config
/// 3. Off-chain: each participant derives keys for the same message using SEAL IBE
/// 4. Off-chain: aggregate derived signatures and aggregate the corresponding public keys
/// 5. On-chain: verify using pairing equation e(σ, g₂) = e(H₁(FullID), Σmpk_i)
/// 6. Use the proof to increment the counter
///
/// Message definition (must match signing side exactly):
///   FullID := package_id || counter_id || signer_address || (DST_SEAL_MSG_DOMAIN || message)
///   H1_input := DST_SEAL_IBE_ID || FullID
///   msg_G1 := hash_to_g1(H1_input)
///
/// Security notes:
/// - Requires **Proof of Possession (PoP)** for each stored public key to prevent rogue-key attacks
/// - Uses SEAL IBE-derived signatures, NOT standard BLS signatures
/// - Enforces uniqueness and membership of contributing signers

module counter::seal_ibe_multisig_counter;

use std::{bcs, type_name};
use sui::{
    address,
    bls12381::{
        g1_from_bytes,
        g2_from_bytes,
        g2_add,
        g2_identity,
        g2_generator,
        hash_to_g1,
        pairing,
        G2
    },
    group_ops::{Element, bytes},
    table::{Table, new}
};

// === Constants ===
const DST_SEAL_MSG_DOMAIN: vector<u8> = b"SUI-SEAL-IBE-V1";
const DST_SEAL_IBE_ID: vector<u8> = b"SUI-SEAL-IBE-BLS12381-00";

// === Test Constants ===

// === Errors ===
#[error]
const EInvalidThreshold: vector<u8> =
    b"Invalid threshold policy: must be between 1 and signer count";

#[error]
const EInsufficientSignatures: vector<u8> = b"Insufficient signers for threshold policy";

#[error]
const EDuplicateSigner: vector<u8> = b"Duplicate signer detected";

#[error]
const ESignerNotRegistered: vector<u8> = b"Signer not registered in counter configuration";

#[error]
const ESignatureVerificationFailed: vector<u8> = b"SEAL IBE signature verification failed";

#[error]
const ECounterMismatch: vector<u8> = b"Counter ID mismatch";

#[error]
const ESignerAlreadyIncluded: vector<u8> = b"Signer already included in aggregation";

#[error]
const EInvalidID: vector<u8> =
    b"Invalid ID: does not match expected counter_id || signer_address format";

#[error]
const ELengthMismatch: vector<u8> = b"Signer IDs and public keys vectors must have same length";

// === Structs ===

/// Marker type for dynamic package ID extraction
public struct PackageMarker has drop {}

/// Configuration for SEAL IBE multi-signature verification
/// Stores SEAL IBE public keys in Table mapped by Signer ID
public struct SealIbeMultisigConfig has store {
    seal_ibe_table: Table<ID, Element<G2>>, // Signer ID → SEAL IBE Public Key
    threshold: u64, // Minimum required signatures (t)
}

/// Counter protected by SEAL IBE multi-signature aggregated signatures
public struct SealIbeMultisigCounter has key {
    id: UID,
    value: u64,
    config: SealIbeMultisigConfig, // Embedded config for simplicity
}

/// One-time proof token for counter operations
/// Prevents replay attacks by consuming proof after use
public struct SealIbeMultisigProof has key {
    id: UID,
    counter_id: ID,
    verified_signer_count: u64, // Number of signatures verified
}

/// Aggregated public key for SEAL IBE multi-signature verification
public struct SealIbeAggregatedPk has key {
    id: UID,
    /// Accumulated public key in G2 group (for internal operations)
    public_key_g2: Element<G2>,
    /// Accumulated public key in 96-byte format (for standard BLS verification)
    public_key_bytes: vector<u8>,
    /// ID of the associated counter
    counter_id: ID,
    /// Number of signers included in aggregation
    signer_count: u64,
    /// Signer IDs already included (for duplicate prevention)
    included_signer_ids: vector<ID>,
}

// === Public Functions ===

/// Create and share SEAL IBE counter with embedded configuration
public fun share(
    signer_ids: vector<ID>,
    signer_pubkeys: vector<vector<u8>>,
    threshold: u64,
    ctx: &mut TxContext,
) {
    // Check input validation
    assert!(signer_ids.length() == signer_pubkeys.length(), ELengthMismatch);
    assert_all_unique(&signer_ids);

    let n = signer_ids.length();
    assert!(threshold > 0, EInvalidThreshold);
    assert!(threshold <= n, EInvalidThreshold);

    // Create table and populate with ID → public key mappings
    let mut seal_ibe_table = new<ID, Element<G2>>(ctx);
    let mut i = 0;
    while (i < n) {
        let signer_id = signer_ids[i];
        let signer_pubkey_g2 = g2_from_bytes(&signer_pubkeys[i]);
        seal_ibe_table.add(signer_id, signer_pubkey_g2);
        i = i + 1;
    };

    let config = SealIbeMultisigConfig {
        seal_ibe_table,
        threshold,
    };

    let counter = SealIbeMultisigCounter {
        id: object::new(ctx),
        value: 0,
        config,
    };

    transfer::share_object(counter);
}

/// Verify aggregated signature and create one-time proof token
/// This is the core function that performs SEAL IBE multi-signature verification
public fun verify_and_create_proof(
    counter: &SealIbeMultisigCounter,
    aggregated_key: &SealIbeAggregatedPk,
    signature_g1_bytes: vector<u8>,
    message: vector<u8>,
    ctx: &mut TxContext,
): SealIbeMultisigProof {
    // Check threshold requirement using authenticated signer count
    assert!(aggregated_key.signer_count >= counter.config.threshold, EInsufficientSignatures);

    // Verify the aggregated signature against authenticated aggregated key
    assert!(
        verify_seal_ibe_multisig(
            &signature_g1_bytes,
            &message,
            aggregated_key,
            ctx.sender(),
        ),
        ESignatureVerificationFailed,
    );

    SealIbeMultisigProof {
        id: object::new(ctx),
        counter_id: object::id(counter),
        verified_signer_count: aggregated_key.signer_count,
    }
}

/// Increment counter using proof token
public fun increment(counter: &mut SealIbeMultisigCounter, proof: SealIbeMultisigProof) {
    let SealIbeMultisigProof { id, counter_id, verified_signer_count: _ } = proof;

    assert!(counter_id == object::id(counter), ECounterMismatch);
    counter.value = counter.value + 1;

    object::delete(id); // Consume proof to prevent replay
}

/// Creates a new aggregated SEAL IBE key associated with a counter
public fun new_seal_ibe_aggregated_pk(
    counter: &SealIbeMultisigCounter,
    ctx: &mut TxContext,
): SealIbeAggregatedPk {
    let identity_g2 = g2_identity();
    SealIbeAggregatedPk {
        id: object::new(ctx),
        public_key_g2: identity_g2,
        public_key_bytes: *bytes(&identity_g2),
        counter_id: object::id(counter),
        signer_count: 0,
        included_signer_ids: vector[],
    }
}

/// Add a signer's public key to the aggregated key
public fun aggregate_signer_pubkey(
    counter: &SealIbeMultisigCounter,
    aggregated_key: &mut SealIbeAggregatedPk,
    signer_id: ID,
) {
    // Counter ID verification
    assert!(object::id(counter) == aggregated_key.counter_id, ECounterMismatch);

    // Check if signer ID is registered in counter config
    assert!(counter.config.seal_ibe_table.contains(signer_id), ESignerNotRegistered);

    // Check for duplicate addition
    assert!(!aggregated_key.included_signer_ids.contains(&signer_id), ESignerAlreadyIncluded);

    // Get the public key from table and add to aggregated key
    let signer_pubkey_g2 = &counter.config.seal_ibe_table[signer_id];
    aggregated_key.public_key_g2 = g2_add(&aggregated_key.public_key_g2, signer_pubkey_g2);

    // Update byte representation
    aggregated_key.public_key_bytes = *bytes(&aggregated_key.public_key_g2);

    // Record this signer ID as included and increment count
    aggregated_key.included_signer_ids.push_back(signer_id);
    aggregated_key.signer_count = aggregated_key.signer_count + 1;
}

// === Private Functions ===

/// Ensure all elements in the vector are unique
fun assert_all_unique<T: drop + copy>(items: &vector<T>) {
    items.length().do!(|i| {
        let (found, j) = items.index_of(&items[i]);
        assert!(found && i == j, EDuplicateSigner);
    });
}

/// Get current package ID dynamically using type reflection
public fun get_package_id_bytes(): vector<u8> {
    let addr: address = type_name::original_id<PackageMarker>();
    bcs::to_bytes(&addr)
}

/// Verify a SEAL IBE multi-signature using pairing equations.
/// Uses FullID to construct the hash-to-G1 input for verification:
///   FullID = package_id || counter_id || signer_address || (DST_SEAL_MSG_DOMAIN || message)
///   H1_input = DST_SEAL_IBE_ID || FullID
///   Verification: e(σ, g₂) = e(H₁(FullID), aggregated_pk_g2)
fun verify_seal_ibe_multisig(
    signature_g1_bytes: &vector<u8>,
    message: &vector<u8>,
    aggregated_key: &SealIbeAggregatedPk,
    signer: address,
): bool {
    // Reconstruct FullID same as in seal_approve: counter_id || signer || domain || message
    let mut inner_id = object::id_to_bytes(&aggregated_key.counter_id);
    let signer_bytes = address::to_bytes(signer);
    inner_id.append(signer_bytes);

    // Prepare message with domain separation (same as in seal_approve)
    let mut message_with_domain = vector[];
    message_with_domain.append(DST_SEAL_MSG_DOMAIN);
    message_with_domain.append(*message);

    // Append domain + message to inner ID
    inner_id.append(message_with_domain);

    // Construct FullID: [PackageID][InnerID] (matching Seal SDK)
    // Seal SDK automatically prepends PackageID, so Move must do the same
    let package_id_bytes = get_package_id_bytes();
    let mut full_id = package_id_bytes;
    full_id.append(inner_id);

    // Construct hash input for SEAL IBE: DST_SEAL_IBE_ID || FullID
    let mut hash_input = DST_SEAL_IBE_ID;
    hash_input.append(full_id);

    // Verify using pairing equation: e(σ, g₂) = e(H₁(hash_input), aggregated_pk_g2)
    let sigma = g1_from_bytes(signature_g1_bytes);
    let g2_gen = g2_generator();
    let h1_point = hash_to_g1(&hash_input);

    // Left side: e(σ, g₂)
    let left_pairing = pairing(&sigma, &g2_gen);

    // Right side: e(H₁(hash_input), aggregated_pk_g2)
    let right_pairing = pairing(&h1_point, &aggregated_key.public_key_g2);

    // Check if pairings are equal
    left_pairing == right_pairing
}

// === View Functions ===

public fun value(self: &SealIbeMultisigCounter): u64 {
    self.value
}

public fun threshold(self: &SealIbeMultisigCounter): u64 {
    self.config.threshold
}

public fun signer_count(self: &SealIbeMultisigCounter): u64 {
    self.config.seal_ibe_table.length()
}

public fun seal_ibe_table(self: &SealIbeMultisigCounter): &Table<ID, Element<G2>> {
    &self.config.seal_ibe_table
}

// === SealIbeAggregatedPk View Functions ===

/// Get the aggregated G2 public key
public fun public_key_g2(self: &SealIbeAggregatedPk): &Element<G2> {
    &self.public_key_g2
}

/// Get the counter ID associated with this aggregated key
public fun aggregated_key_counter_id(self: &SealIbeAggregatedPk): ID {
    self.counter_id
}

/// Get the signer IDs included in the aggregation
public fun included_signer_ids(self: &SealIbeAggregatedPk): &vector<ID> {
    &self.included_signer_ids
}

/// Get the count of signers included in the aggregation
public fun included_signer_count(self: &SealIbeAggregatedPk): u64 {
    self.included_signer_ids.length()
}

/// Destroy SealIbeAggregatedPk object
public fun destroy_seal_ibe_aggregated_pk(key: SealIbeAggregatedPk) {
    let SealIbeAggregatedPk {
        id,
        public_key_g2: _,
        public_key_bytes: _,
        counter_id: _,
        signer_count: _,
        included_signer_ids: _,
    } = key;
    object::delete(id);
}

/// Destroy SealIbeMultisigProof object (for testing only)
#[test_only]
public fun test_destroy_proof(proof: SealIbeMultisigProof) {
    let SealIbeMultisigProof {
        id,
        counter_id: _,
        verified_signer_count: _,
    } = proof;
    object::delete(id);
}

// === Seal Integration Functions ===

/// Seal approve function for SEAL IBE counter access
/// InnerID structure: counter_id || signer_address || H(domain || message)
entry fun seal_approve(
    id: vector<u8>,
    counter: &SealIbeMultisigCounter,
    message: vector<u8>,
    _ctx: &TxContext,
) {
    // Construct expected InnerID: counter_id || signer_address || H(domain || message)
    let mut expected_inner_id = object::id_to_bytes(&object::id(counter));
    let signer_bytes = address::to_bytes(_ctx.sender());
    expected_inner_id.append(signer_bytes);

    // Prepare message with domain separation matching SEAL IBE verification
    let mut message_with_domain = vector[];
    message_with_domain.append(DST_SEAL_MSG_DOMAIN);
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
    signer_ids: vector<ID>,
    signer_pubkey_bytes: vector<vector<u8>>,
    threshold: u64,
    ctx: &mut TxContext,
): SealIbeMultisigCounter {
    let mut seal_ibe_table = new<ID, Element<G2>>(ctx);
    let mut i = 0;
    while (i < signer_ids.length()) {
        let signer_id = signer_ids[i];
        let signer_pubkey_g2 = g2_from_bytes(&signer_pubkey_bytes[i]);
        seal_ibe_table.add(signer_id, signer_pubkey_g2);
        i = i + 1;
    };

    let config = SealIbeMultisigConfig {
        seal_ibe_table,
        threshold,
    };

    SealIbeMultisigCounter {
        id: object::new(ctx),
        value: 0,
        config,
    }
}

#[test_only]
public fun test_destroy_counter(counter: SealIbeMultisigCounter) {
    let SealIbeMultisigCounter { id, value: _, config } = counter;
    let SealIbeMultisigConfig { seal_ibe_table, threshold: _ } = config;

    // For testing, we assume the table might not be empty
    // In practice, dropping the table will handle cleanup automatically
    seal_ibe_table.drop();
    object::delete(id);
}

/// Test helper: Create proof without signature verification
#[test_only]
public fun test_create_proof(
    counter: &SealIbeMultisigCounter,
    verified_signer_count: u64,
    ctx: &mut TxContext,
): SealIbeMultisigProof {
    SealIbeMultisigProof {
        id: object::new(ctx),
        counter_id: object::id(counter),
        verified_signer_count,
    }
}

/// Debug function to test ID construction with fixed values
#[test]
public fun test_debug_id_construction() {
    use std::debug;
    use sui::hex;

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
    message_with_domain.append(DST_SEAL_MSG_DOMAIN);
    message_with_domain.append(message);

    debug::print(&b"Step 3 - Message with domain:");
    debug::print(&b"Domain separator: SUI-SEAL-IBE-V1");
    debug::print(&hex::encode(DST_SEAL_MSG_DOMAIN));
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
    let mut ibe_hash_input = DST_SEAL_IBE_ID;
    ibe_hash_input.append(full_id);
    debug::print(&b"Step 7 - Hash input for hash_to_g1:");
    debug::print(&b"SEAL DST: SUI-SEAL-IBE-BLS12381-00");
    debug::print(&hex::encode(DST_SEAL_IBE_ID));
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
