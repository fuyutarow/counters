// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

#[test_only]
module counter::multi_ibs_counter_test;

use counter::multi_ibs_counter::{Self, MultiIBSCounter, MultiIBSProof, AggregatedSignature};
use std::string;
use sui::{
    bls12381::{g1_identity, g2_identity, g1_from_bytes, g2_from_bytes},
    test_scenario::{Self as ts, Scenario, next_tx, ctx},
    test_utils
};

// Test addresses
const ADMIN: address = @0xa;
const USER: address = @0xb;

// Test package ID
const TEST_PACKAGE_ID: address = @0x1234;

/// Test basic Multi-IBS counter creation and sharing
#[test]
fun test_share_counter() {
    let mut scenario = ts::begin(ADMIN);

    // Create mock Key Server IDs
    let key_server_id1 = object::id_from_address(@0x1111);
    let key_server_id2 = object::id_from_address(@0x2222);
    let key_server_id3 = object::id_from_address(@0x3333);

    let key_server_ids = vector[key_server_id1, key_server_id2, key_server_id3];
    let threshold = 2; // 2-of-3

    next_tx(&mut scenario, ADMIN);
    {
        multi_ibs_counter::share(
            key_server_ids,
            threshold,
            ctx(&mut scenario),
        );
    };

    next_tx(&mut scenario, ADMIN);
    {
        let counter = ts::take_shared<MultiIBSCounter>(&scenario);

        // Verify counter properties
        assert!(multi_ibs_counter::threshold(&counter) == 2, 0);
        assert!(multi_ibs_counter::total_key_servers(&counter) == 3, 0);
        assert!(multi_ibs_counter::value(&counter) == 0, 0);

        ts::return_shared(counter);
    };

    ts::end(scenario);
}

/// Test signer index validation (should fail with duplicate indices)
#[test]
#[expected_failure(abort_code = multi_ibs_counter::EDuplicateSigner)]
fun test_duplicate_signer_indices() {
    let mut scenario = ts::begin(ADMIN);

    setup_config_and_counter(&mut scenario);

    next_tx(&mut scenario, USER);
    {
        let counter = ts::take_shared<MultiIBSCounter>(&scenario);

        // Create aggregated signature with duplicate signer indices
        let aggregated_sig = multi_ibs_counter::test_create_aggregated_signature(
            x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // dummy signature
            vector[0, 1, 0], // Duplicate index 0
            b"test message",
        );

        let _proof = multi_ibs_counter::verify_and_mint_proof(
            &counter,
            aggregated_sig,
            ctx(&mut scenario),
        );

        ts::return_shared(counter);
    };

    ts::end(scenario);
}

/// Test insufficient signatures (should fail when below threshold)
#[test]
#[expected_failure(abort_code = multi_ibs_counter::EInsufficientSignatures)]
fun test_insufficient_signatures() {
    let mut scenario = ts::begin(ADMIN);

    setup_config_and_counter(&mut scenario);

    next_tx(&mut scenario, USER);
    {
        let counter = ts::take_shared<MultiIBSCounter>(&scenario);

        // Create aggregated signature with only 1 signature (threshold is 2)
        let aggregated_sig = multi_ibs_counter::test_create_aggregated_signature(
            x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
            vector[0], // Only 1 signer, but threshold is 2
            b"test message",
        );

        let _proof = multi_ibs_counter::verify_and_mint_proof(
            &counter,
            aggregated_sig,
            ctx(&mut scenario),
        );

        ts::return_shared(counter);
    };

    ts::end(scenario);
}

/// Test out-of-bounds signer index
#[test]
#[expected_failure(abort_code = multi_ibs_counter::EInvalidSignerIndex)]
fun test_invalid_signer_index() {
    let mut scenario = ts::begin(ADMIN);

    setup_config_and_counter(&mut scenario);

    next_tx(&mut scenario, USER);
    {
        let counter = ts::take_shared<MultiIBSCounter>(&scenario);

        // Create aggregated signature with out-of-bounds index
        let aggregated_sig = multi_ibs_counter::test_create_aggregated_signature(
            x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
            vector[0, 5], // Index 5 is out of bounds (only have 3 Key Servers: indices 0,1,2)
            b"test message",
        );

        let _proof = multi_ibs_counter::verify_and_mint_proof(
            &counter,
            aggregated_sig,
            ctx(&mut scenario),
        );

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
        let mut counter = ts::take_shared<MultiIBSCounter>(&scenario);

        // Create a mock proof directly (bypassing signature verification for this test)
        let proof = multi_ibs_counter::MultiIBSProof {
            id: object::new(ctx(&mut scenario)),
            counter_id: object::id(&counter),
            verified_signer_count: 2,
        };

        // Verify initial value
        assert!(multi_ibs_counter::value(&counter) == 0, 0);

        // Increment counter
        multi_ibs_counter::increment(&mut counter, proof);

        // Verify incremented value
        assert!(multi_ibs_counter::value(&counter) == 1, 0);

        ts::return_shared(counter);
    };

    ts::end(scenario);
}

/// Test config-counter mismatch (should fail when using wrong config)
#[test]
#[expected_failure(abort_code = multi_ibs_counter::EConfigMismatch)]
fun test_config_counter_mismatch() {
    let mut scenario = ts::begin(ADMIN);

    // Create first config and counter
    next_tx(&mut scenario, ADMIN);
    {
        multi_ibs_counter::share_config(
            TEST_PACKAGE_ID,
            vector[object::id_from_address(@0x1111)],
            1,
            ctx(&mut scenario),
        );
    };

    next_tx(&mut scenario, ADMIN);
    {
        let config1 = ts::take_shared<MultiIBSConfig>(&scenario);
        multi_ibs_counter::share_counter(&config1, ctx(&mut scenario));
        ts::return_shared(config1);
    };

    // Create second config
    next_tx(&mut scenario, ADMIN);
    {
        multi_ibs_counter::share_config(
            TEST_PACKAGE_ID,
            vector[object::id_from_address(@0x2222)],
            1,
            ctx(&mut scenario),
        );
    };

    next_tx(&mut scenario, USER);
    {
        let counter = ts::take_shared<MultiIBSCounter>(&scenario);
        let configs = ts::take_shared_by_id<MultiIBSConfig>(&scenario /* get second config ID */);

        // This should fail because counter was created with first config
        let aggregated_sig = multi_ibs_counter::test_create_aggregated_signature(
            x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
            vector[0],
            b"test message",
        );

        let _proof = multi_ibs_counter::verify_and_mint_proof(
            &counter,
            &configs[1], // Using wrong config
            aggregated_sig,
            ctx(&mut scenario),
        );

        ts::return_shared(counter);
        // Note: This test is simplified and may need adjustment based on actual test framework behavior
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

        multi_ibs_counter::share(
            key_server_ids,
            2, // 2-of-3 threshold
            ctx(scenario),
        );
    };
}
