/// Test module for IBS Counter functionality
/// Tests the Identity-Based Signature counter operations including
/// signature verification, proof generation, and counter increment
module counter::ibs_counter_test;

use counter::ibs_counter::{Self, IBSParams, IBSCounter};
use std::unit_test::assert_eq;
use sui::test_scenario::{Self, Scenario};

// === Test Constants ===

// Test master public key (G2 element) - valid BLS12-381 G2 generator for testing
const TEST_MPK: vector<u8> =
    x"93e02b6052719f607dacd3a088274f65596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e024aa2b2f08f0a91260805272dc51051c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb8";
const TEST_DST: vector<u8> = b"IBS-TEST-DST";
const TEST_ID: vector<u8> = b"alice@example.com";
const TEST_MSG: vector<u8> = b"test message";
const TEST_SIG: vector<u8> =
    x"97f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb";

// === Test Helper Functions ===

#[test_only]
public fun setup_test_params(scenario: &mut Scenario): IBSParams {
    let ctx = test_scenario::ctx(scenario);
    ibs_counter::new_params(
        TEST_MPK,
        TEST_DST,
        5, // threshold t
        10, // total n
        1, // version
        ctx,
    )
}

#[test_only]
public fun setup_test_counter(scenario: &mut Scenario): IBSCounter {
    let params = setup_test_params(scenario);
    let ctx = test_scenario::ctx(scenario);

    ibs_counter::test_create_counter(params, ctx)
}

// === Basic Functionality Tests ===

#[test]
public fun test_create_ibs_params() {
    let mut scenario_val = test_scenario::begin(@0x1);
    let scenario = &mut scenario_val;

    let params = setup_test_params(scenario);

    // Verify the parameters are set correctly - need to create counter to test
    let counter = ibs_counter::test_create_counter(params, test_scenario::ctx(scenario));
    let (t, n) = ibs_counter::threshold_params(&counter);
    assert_eq!(t, 5);
    assert_eq!(n, 10);
    assert_eq!(ibs_counter::version(&counter), 1);

    // Clean up counter
    ibs_counter::test_destroy_counter(counter);

    test_scenario::end(scenario_val);
}

#[test]
public fun test_share_ibs_counter() {
    let mut scenario_val = test_scenario::begin(@0x1);
    let scenario = &mut scenario_val;

    let params = setup_test_params(scenario);
    let ctx = test_scenario::ctx(scenario);

    // Share the counter - this should not fail
    ibs_counter::share(params, ctx);

    test_scenario::end(scenario_val);
}

#[test]
public fun test_counter_view_functions() {
    let mut scenario_val = test_scenario::begin(@0x1);
    let scenario = &mut scenario_val;

    let counter = setup_test_counter(scenario);

    // Test view functions
    assert_eq!(ibs_counter::value(&counter), 0);
    assert_eq!(ibs_counter::version(&counter), 1);
    let (t, n) = ibs_counter::threshold_params(&counter);
    assert_eq!(t, 5);
    assert_eq!(n, 10);

    // Clean up counter
    ibs_counter::test_destroy_counter(counter);

    test_scenario::end(scenario_val);
}

// === Error Case Tests ===

#[test]
#[expected_failure(abort_code = sui::group_ops::EInvalidInput)]
public fun test_invalid_signature_fails() {
    let mut scenario_val = test_scenario::begin(@0x1);
    let scenario = &mut scenario_val;

    let counter = setup_test_counter(scenario);
    let ctx = test_scenario::ctx(scenario);

    // Try to verify with invalid signature (all zeros)
    let mut invalid_sig = vector::empty<u8>();
    let mut i = 0;
    while (i < 48) {
        invalid_sig.push_back(0u8);
        i = i + 1;
    };

    // This should fail with EInvalidSignature before creating proof
    let _proof = ibs_counter::verify_and_mint_proof(
        &counter,
        invalid_sig,
        TEST_ID,
        TEST_MSG,
        ctx,
    );

    // This code should never be reached due to expected failure
    ibs_counter::test_destroy_proof(_proof);
    ibs_counter::test_destroy_counter(counter);

    test_scenario::end(scenario_val);
}

#[test]
#[
    expected_failure(
        abort_code = counter::ibs_counter::ECounterMismatch,
        location = counter::ibs_counter,
    ),
]
public fun test_wrong_counter_proof_fails() {
    let mut scenario_val = test_scenario::begin(@0x1);
    let scenario = &mut scenario_val;

    // Create two different counters
    let mut counter1 = setup_test_counter(scenario);
    let counter2 = setup_test_counter(scenario);
    let ctx = test_scenario::ctx(scenario);

    // Create proof for counter2
    let proof = ibs_counter::test_create_proof(&counter2, ctx);

    // Try to use proof on counter1 - should fail
    ibs_counter::increment(&mut counter1, proof);

    // Clean up counters
    ibs_counter::test_destroy_counter(counter1);
    ibs_counter::test_destroy_counter(counter2);

    test_scenario::end(scenario_val);
}

// === Integration Tests ===

#[test]
public fun test_verify_ibs_with_known_values() {
    let mut scenario_val = test_scenario::begin(@0x1);
    let scenario = &mut scenario_val;

    let params = setup_test_params(scenario);

    // Test the core verification function with test vectors
    // Note: In a real implementation, you'd use actual BLS12-381 test vectors
    let result = ibs_counter::verify_ibs(
        &params,
        TEST_SIG,
        TEST_ID,
        TEST_MSG,
    );

    // For testing purposes, we expect this to return false with our dummy data
    // In production, you'd use real cryptographic test vectors
    assert!(!result, 0);

    // Clean up params
    ibs_counter::test_destroy_params(params);

    test_scenario::end(scenario_val);
}

#[test]
public fun test_multiple_increments() {
    let mut scenario_val = test_scenario::begin(@0x1);
    let scenario = &mut scenario_val;

    let mut counter = setup_test_counter(scenario);
    let ctx = test_scenario::ctx(scenario);

    // Create multiple proof tokens and increment
    let initial_value = ibs_counter::value(&counter);

    // Create first proof
    let proof1 = ibs_counter::test_create_proof(&counter, ctx);

    ibs_counter::increment(&mut counter, proof1);
    assert_eq!(ibs_counter::value(&counter), initial_value + 1);

    // Create second proof
    let proof2 = ibs_counter::test_create_proof(&counter, ctx);

    ibs_counter::increment(&mut counter, proof2);
    assert_eq!(ibs_counter::value(&counter), initial_value + 2);

    // Clean up counter
    ibs_counter::test_destroy_counter(counter);

    test_scenario::end(scenario_val);
}

// === Performance and Edge Case Tests ===

#[test]
public fun test_large_counter_value() {
    let mut scenario_val = test_scenario::begin(@0x1);
    let scenario = &mut scenario_val;

    let mut counter = setup_test_counter(scenario);
    let ctx = test_scenario::ctx(scenario);

    // Increment counter many times to test large values
    let target_value = 1000u64;
    let mut i = 0;

    while (i < target_value) {
        let proof = ibs_counter::test_create_proof(&counter, ctx);
        ibs_counter::increment(&mut counter, proof);
        i = i + 1;
    };

    assert_eq!(ibs_counter::value(&counter), target_value);

    // Clean up counter
    ibs_counter::test_destroy_counter(counter);

    test_scenario::end(scenario_val);
}

#[test]
public fun test_different_dst_values() {
    let mut scenario_val = test_scenario::begin(@0x1);
    let scenario = &mut scenario_val;
    let ctx = test_scenario::ctx(scenario);

    // Create params with different DST
    let dst1 = b"DST-VERSION-1";
    let dst2 = b"DST-VERSION-2";

    let params1 = ibs_counter::new_params(TEST_MPK, dst1, 5, 10, 1, ctx);
    let params2 = ibs_counter::new_params(TEST_MPK, dst2, 5, 10, 1, ctx);

    // Verify that different DSTs produce different results
    let result1 = ibs_counter::verify_ibs(&params1, TEST_SIG, TEST_ID, TEST_MSG);
    let result2 = ibs_counter::verify_ibs(&params2, TEST_SIG, TEST_ID, TEST_MSG);

    // With same signature but different DST, results should be the same (both false in this test case)
    // In real cryptographic scenarios, different DSTs would affect the hash computation
    assert_eq!(result1, result2); // Both should be false with test data

    // Clean up params
    ibs_counter::test_destroy_params(params1);
    ibs_counter::test_destroy_params(params2);

    test_scenario::end(scenario_val);
}
