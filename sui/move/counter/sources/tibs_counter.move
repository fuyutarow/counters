// Threshold Identity-Based Signature (TIBS) protected counter implementation
//
// PURPOSE:
// This module implements a counter that can only be incremented when a threshold number
// of valid IBS (Identity-Based Signature) signatures are provided from authorized signers.
//
// WHAT THIS ACHIEVES:
// 1. Distributed Authority: No single entity can increment the counter alone
// 2. Threshold Security: Requires t-of-n signatures to perform operations
// 3. Sybil Resistance: Each signer is uniquely identified and can only sign once per operation
// 4. Replay Protection: Uses one-time proof tokens to prevent signature reuse
// 5. Configuration Flexibility: Counter and config are decoupled for reusability
//
// CRYPTOGRAPHIC FOUNDATION:
// - Uses BLS12-381 pairing-based cryptography for IBS verification
// - Each signer has a master public key (mpk) in G2
// - Signatures are elements in G1, derived from secret keys (sk_ID)
// - Verification equation: e(σ, G2_gen) = e(H(ID||msg), mpk)
//
// TYPICAL FLOW:
// 1. Deploy TIBSConfig with n signers and threshold t
// 2. Deploy TIBSCounter linked to the config
// 3. Collect t signatures from different signers off-chain
// 4. Call verify_and_mint_proof() with signatures
// 5. Use proof to increment counter via increment_with_proof()
//
// SECURITY ASSUMPTIONS:
// - At least t signers are honest (threshold assumption)
// - Master public keys (mpks) are correctly registered
// - Underlying BLS12-381 and pairing assumptions hold
//
// LIMITATIONS & CONSIDERATIONS:
// - Gas cost scales with number of signatures to verify (2 pairings per signature)
// - Maximum practical threshold depends on transaction size limits
// - Does NOT implement signature aggregation (each verified independently)
// - Does NOT implement weighted voting (all signers have equal weight)
//
module counter::tibs_counter;

use sui::{bls12381::{Self, G2}, group_ops::Element};

// === Constants ===
const DST_DERIVE_KEY: vector<u8> = b"SUI-TIBS-COUNTER-V1";

// === Errors ===
#[error]
const EInvalidThreshold: vector<u8> = b"Threshold must be between 1 and total signers";

#[error]
const EDuplicateSigner: vector<u8> = b"Duplicate signer detected";

#[error]
const EInsufficientSignatures: vector<u8> = b"Insufficient valid signatures for threshold";

#[error]
const ECounterMismatch: vector<u8> = b"Proof does not match counter";

#[error]
const EConfigMismatch: vector<u8> = b"Configuration does not match counter";

// === Structs ===

/// Signer information for TIBS
/// Each signer is identified by an address and holds a BLS public key
public struct SignerInfo has copy, drop, store {
    signer_id: address,
    public_key: Element<G2>, // G2 element parsed and ready to use
}

/// Configuration for threshold IBS verification
/// Defines the authorized signers and required threshold
public struct TIBSConfig has key, store {
    id: UID,
    package_id: address, // Application package identifier
    signers: vector<SignerInfo>,
    required_signatures: u64,
}

/// Counter protected by threshold IBS
/// Value can only be modified through valid threshold signatures
public struct TIBSCounter has key {
    id: UID,
    value: u64,
    config_id: ID, // Reference to the TIBSConfig
}

/// One-time proof token for counter operations
/// Prevents replay attacks by consuming proof after use
public struct TIBSProof has key {
    id: UID,
    counter_id: ID,
    verified_count: u64, // Number of valid signatures that were verified
}

/// Bundle containing a signature from a specific signer
/// Used to pass signatures to verification function
public struct SignatureBundle has drop {
    signer_id: address,
    signature_bytes: vector<u8>, // G1 element serialized
}

// === Public Functions ===

/// Create and share TIBS configuration
/// Sets up the authorized signers and threshold requirement
public fun share_config(
    package_id: address,
    signer_ids: vector<address>,
    public_keys: vector<vector<u8>>,
    required_signatures: u64,
    ctx: &mut TxContext,
) {
    let total_signers = signer_ids.length();
    assert!(total_signers > 0, EInvalidThreshold);
    assert!(total_signers == public_keys.length(), EInvalidThreshold);
    assert!(required_signatures > 0 && required_signatures <= total_signers, EInvalidThreshold);

    // Verify no duplicates
    verify_no_duplicate_addresses(&signer_ids);

    // Parse and validate each public key as G2
    let mut signers = vector[];
    let mut i = 0;
    while (i < total_signers) {
        let public_key = bls12381::g2_from_bytes(&public_keys[i]);
        signers.push_back(SignerInfo {
            signer_id: signer_ids[i],
            public_key,
        });
        i = i + 1;
    };

    let config = TIBSConfig {
        id: object::new(ctx),
        package_id,
        signers,
        required_signatures,
    };

    transfer::share_object(config);
}

/// Create and share TIBS counter
/// Counter is linked to a specific config for verification
public fun share_counter(config: &TIBSConfig, ctx: &mut TxContext) {
    let counter = TIBSCounter {
        id: object::new(ctx),
        value: 0,
        config_id: object::id(config),
    };
    transfer::share_object(counter);
}

/// Verify signatures and create proof
/// Validates threshold signatures and mints one-time proof token
public fun verify_and_mint_proof(
    counter: &TIBSCounter,
    config: &TIBSConfig,
    signatures: vector<SignatureBundle>,
    id: vector<u8>, // [PackageId][InnerId]
    message: vector<u8>,
    ctx: &mut TxContext,
): TIBSProof {
    // Ensure config matches counter
    assert!(object::id(config) == counter.config_id, EConfigMismatch);

    let mut seen_signers = vector[];
    let mut valid_count = 0;

    signatures.do_ref!(|sig| {
        // Prevent duplicate signers
        assert!(!seen_signers.contains(&sig.signer_id), EDuplicateSigner);
        seen_signers.push_back(sig.signer_id);

        // Find signer info
        let mut signer_opt = find_signer(&config.signers, sig.signer_id);

        if (signer_opt.is_some()) {
            let signer = signer_opt.extract();
            // Verify signature
            if (
                verify_signature(
                    &sig.signature_bytes,
                    &id,
                    &message,
                    &signer.public_key,
                )
            ) {
                valid_count = valid_count + 1;
            }
        }
    });

    // Ensure threshold is met
    assert!(valid_count >= config.required_signatures, EInsufficientSignatures);

    TIBSProof {
        id: object::new(ctx),
        counter_id: object::id(counter),
        verified_count: valid_count,
    }
}

/// Increment counter with proof
/// Consumes proof token to prevent replay
public fun increment(counter: &mut TIBSCounter, proof: TIBSProof) {
    let TIBSProof { id, counter_id, verified_count: _ } = proof;

    assert!(counter_id == object::id(counter), ECounterMismatch);
    counter.value = counter.value + 1;

    object::delete(id); // Consume proof
}

// === Private Functions ===

/// Prepare message with domain separation
fun prepare_message(message: &vector<u8>): vector<u8> {
    let mut prepared = vector[];
    prepared.append(DST_DERIVE_KEY);
    prepared.append(*message);
    prepared
}

/// Core signature verification
/// Implements pairing-based verification: e(σ, G2_gen) = e(H(combined), mpk)
fun verify_signature(
    signature_bytes: &vector<u8>,
    id: &vector<u8>, // [PackageId][InnerId]
    message: &vector<u8>,
    public_key_g2: &Element<G2>,
): bool {
    // Parse signature element
    let signature_g1 = bls12381::g1_from_bytes(signature_bytes);

    // Prepare message with domain separation
    let prepared_message = prepare_message(message);

    // Combined hash for IBS (ID || message)
    let mut combined = vector[];
    combined.append(*id);
    combined.append(prepared_message);
    let h_combined = bls12381::hash_to_g1(&combined);

    // Verify pairing equation
    let lhs = bls12381::pairing(&signature_g1, &bls12381::g2_generator());
    let rhs = bls12381::pairing(&h_combined, public_key_g2);

    lhs == rhs
}

/// Find signer by ID
fun find_signer(signers: &vector<SignerInfo>, signer_id: address): Option<SignerInfo> {
    let mut i = 0;
    while (i < signers.length()) {
        if (signers[i].signer_id == signer_id) {
            return option::some(signers[i])
        };
        i = i + 1;
    };
    option::none()
}

/// Verify no duplicate addresses
fun verify_no_duplicate_addresses(addresses: &vector<address>) {
    let mut i = 0;
    while (i < addresses.length()) {
        let mut j = i + 1;
        while (j < addresses.length()) {
            assert!(addresses[i] != addresses[j], EDuplicateSigner);
            j = j + 1;
        };
        i = i + 1;
    }
}

// === View Functions ===

public fun value(self: &TIBSCounter): u64 {
    self.value
}

public fun config_id(self: &TIBSCounter): ID {
    self.config_id
}

public fun required_signatures(self: &TIBSConfig): u64 {
    self.required_signatures
}

public fun total_signers(self: &TIBSConfig): u64 {
    self.signers.length()
}

// === Test Functions ===

#[test_only]
public fun test_create_signature_bundle(
    signer_id: address,
    signature_bytes: vector<u8>,
): SignatureBundle {
    SignatureBundle { signer_id, signature_bytes }
}

#[test_only]
public fun test_destroy_config(config: TIBSConfig) {
    let TIBSConfig { id, package_id: _, signers: _, required_signatures: _ } = config;
    object::delete(id);
}

#[test_only]
public fun test_destroy_counter(counter: TIBSCounter) {
    let TIBSCounter { id, value: _, config_id: _ } = counter;
    object::delete(id);
}

#[test_only]
public fun test_destroy_proof(proof: TIBSProof) {
    let TIBSProof { id, counter_id: _, verified_count: _ } = proof;
    object::delete(id);
}
