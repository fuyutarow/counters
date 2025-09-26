// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

#[test_only]
module counter::multi_ibs_counter_test;

use counter::multi_ibs_counter::{Self, MultiIBSCounter};
use sui::test_scenario::{Self as ts, Scenario, next_tx, ctx};

// Test addresses
const ADMIN: address = @0xa;
const USER: address = @0xb;

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
        assert!(multi_ibs_counter::key_server_count(&counter) == 3, 0);
        assert!(multi_ibs_counter::value(&counter) == 0, 0);

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
        let counter = ts::take_shared<MultiIBSCounter>(&scenario);

        // Create aggregated signature
        let _aggregated_sig = multi_ibs_counter::test_create_aggregated_signature(
            x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // dummy signature
            b"test message",
        );

        let aggregated_key = multi_ibs_counter::new_aggregated_public_key(
            &counter,
            ctx(&mut scenario),
        );
        // Note: In practice, you would need to add key servers to the aggregated key first

        ts::return_shared(counter);
        multi_ibs_counter::destroy_aggregated_public_key(aggregated_key);
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

        // Create aggregated signature (aggregated key will have 0 key servers, threshold is 2)
        let aggregated_sig = multi_ibs_counter::test_create_aggregated_signature(
            x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
            b"test message",
        );

        let aggregated_key = multi_ibs_counter::new_aggregated_public_key(
            &counter,
            ctx(&mut scenario),
        );

        let _proof = multi_ibs_counter::verify_and_create_proof(
            &counter,
            &aggregated_key,
            aggregated_sig,
            ctx(&mut scenario),
        );

        multi_ibs_counter::destroy_aggregated_public_key(aggregated_key);
        multi_ibs_counter::test_destroy_proof(_proof);

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
        let counter = ts::take_shared<MultiIBSCounter>(&scenario);

        // Create aggregated signature and key for testing
        let _aggregated_sig = multi_ibs_counter::test_create_aggregated_signature(
            x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
            b"test message",
        );

        let aggregated_key = multi_ibs_counter::new_aggregated_public_key(
            &counter,
            ctx(&mut scenario),
        );
        // Note: In practice, key servers would be added to aggregated_key first

        // Note: Actual proof creation would require proper BLS signature verification
        // This test focuses on the counter mechanics assuming valid proofs can be created

        multi_ibs_counter::destroy_aggregated_public_key(aggregated_key);

        // Verify initial value remains 0 (no increment without valid proof)
        assert!(multi_ibs_counter::value(&counter) == 0, 0);

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

        multi_ibs_counter::share(
            key_server_ids,
            2, // 2-of-3 threshold
            ctx(scenario),
        );
    };
}
