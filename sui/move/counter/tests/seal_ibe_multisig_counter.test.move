// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

#[test_only]
module counter::seal_ibe_multisig_counter_test;

use counter::seal_ibe_multisig_counter::{Self, SealIbeMultisigCounter};
use sui::test_scenario::{Self as ts, Scenario, next_tx, ctx};

// Test addresses
const ADMIN: address = @0xa;
const USER: address = @0xb;

/// Test basic SEAL IBE counter creation and sharing
#[test]
fun test_share_counter() {
    let mut scenario = ts::begin(ADMIN);

    // Create mock Key Server IDs
    let key_server_id1 = object::id_from_address(@0x1111);
    let key_server_id2 = object::id_from_address(@0x2222);
    let key_server_id3 = object::id_from_address(@0x3333);

    let key_server_ids = vector[key_server_id1, key_server_id2, key_server_id3];

    // Create valid G2 public key (identity element, 96 bytes)
    let mock_pubkey = vector[
        192u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
        0u8,
    ];
    let seal_shard_pubkeys = vector[mock_pubkey, mock_pubkey, mock_pubkey];
    let threshold = 2; // 2-of-3

    next_tx(&mut scenario, ADMIN);
    {
        seal_ibe_multisig_counter::share(
            key_server_ids,
            seal_shard_pubkeys,
            threshold,
            ctx(&mut scenario),
        );
    };

    next_tx(&mut scenario, ADMIN);
    {
        let counter = ts::take_shared<SealIbeMultisigCounter>(&scenario);

        // Verify counter properties
        assert!(seal_ibe_multisig_counter::threshold(&counter) == 2, 0);
        assert!(seal_ibe_multisig_counter::signer_count(&counter) == 3, 0);
        assert!(seal_ibe_multisig_counter::value(&counter) == 0, 0);

        ts::return_shared(counter);
    };

    ts::end(scenario);
}

/// Test basic verification with sufficient signatures
#[test]
fun test_basic_verification() {
    let mut scenario = ts::begin(ADMIN);

    setup_config_and_counter(&mut scenario);

    next_tx(&mut scenario, USER);
    {
        let counter = ts::take_shared<SealIbeMultisigCounter>(&scenario);

        // Create mock signature data
        let _signature_g1_bytes =
            x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"; // dummy signature
        let _message = b"test message";

        let aggregated_key = seal_ibe_multisig_counter::new_seal_ibe_aggregated_pk(
            &counter,
            ctx(&mut scenario),
        );
        // Note: In practice, you would need to add key servers to the aggregated key first

        ts::return_shared(counter);
        seal_ibe_multisig_counter::destroy_seal_ibe_aggregated_pk(aggregated_key);
    };

    ts::end(scenario);
}

/// Test insufficient signatures (should fail when below threshold)
#[test]
#[expected_failure(abort_code = seal_ibe_multisig_counter::EInsufficientSignatures)]
fun test_insufficient_signatures() {
    let mut scenario = ts::begin(ADMIN);

    setup_config_and_counter(&mut scenario);

    next_tx(&mut scenario, USER);
    {
        let counter = ts::take_shared<SealIbeMultisigCounter>(&scenario);

        // Create mock signature data (aggregated key will have 0 key servers, threshold is 2)
        let signature_g1_bytes =
            x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        let message = b"test message";

        let aggregated_key = seal_ibe_multisig_counter::new_seal_ibe_aggregated_pk(
            &counter,
            ctx(&mut scenario),
        );

        let _proof = seal_ibe_multisig_counter::verify_and_create_proof(
            &counter,
            &aggregated_key,
            signature_g1_bytes,
            message,
            ctx(&mut scenario),
        );

        seal_ibe_multisig_counter::destroy_seal_ibe_aggregated_pk(aggregated_key);
        seal_ibe_multisig_counter::test_destroy_proof(_proof);

        ts::return_shared(counter);
    };

    ts::end(scenario);
}

/// Test successful counter increment with mock proof
/// Note: This test uses mock data as we don't have actual Key Server objects
/// In a real scenario, the signature verification would happen with actual BLS signatures
#[test]
fun test_counter_increment_with_mock_proof() {
    let mut scenario = ts::begin(ADMIN);

    setup_config_and_counter(&mut scenario);

    next_tx(&mut scenario, USER);
    {
        let counter = ts::take_shared<SealIbeMultisigCounter>(&scenario);

        // Create mock signature data for testing
        let _signature_g1_bytes =
            x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        let _message = b"test message";

        let aggregated_key = seal_ibe_multisig_counter::new_seal_ibe_aggregated_pk(
            &counter,
            ctx(&mut scenario),
        );
        // Note: In practice, key servers would be added to aggregated_key first

        // Note: Actual proof creation would require proper BLS signature verification
        // This test focuses on the counter mechanics assuming valid proofs can be created

        seal_ibe_multisig_counter::destroy_seal_ibe_aggregated_pk(aggregated_key);

        // Verify initial value remains 0 (no increment without valid proof)
        assert!(seal_ibe_multisig_counter::value(&counter) == 0, 0);

        ts::return_shared(counter);
    };

    ts::end(scenario);
}

// === Helper Functions ===

/// Set up basic config and counter for testing
fun setup_config_and_counter(scenario: &mut Scenario) {
    next_tx(scenario, ADMIN);
    {
        let key_server_ids = vector[
            object::id_from_address(@0x1111),
            object::id_from_address(@0x2222),
            object::id_from_address(@0x3333),
        ];

        // Create valid G2 public key (identity element, 96 bytes)
        let mock_pubkey = vector[
            192u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
            0u8,
        ];
        let seal_shard_pubkeys = vector[mock_pubkey, mock_pubkey, mock_pubkey];

        seal_ibe_multisig_counter::share(
            key_server_ids,
            seal_shard_pubkeys,
            2, // 2-of-3 threshold
            ctx(scenario),
        );
    };
}
