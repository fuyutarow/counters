// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

#[test_only]
module counter::pedersen_counter_tests;

use counter::pedersen_counter;
use sui::{bls12381, test_scenario};

#[test]
fun test_create_and_verify_commitment() {
    let scenario = test_scenario::begin(@0x1);

    // Create a commitment to value 5 with random blinding
    let blinding = bls12381::scalar_from_u64(42);
    let commitment = pedersen_counter::commit(5, &blinding);

    // Verify the commitment opens correctly
    assert!(pedersen_counter::verify_opening(&commitment, 5, &blinding), 0);

    // Verify it fails with wrong value
    assert!(!pedersen_counter::verify_opening(&commitment, 6, &blinding), 1);

    // Verify it fails with wrong blinding
    let wrong_blinding = bls12381::scalar_from_u64(99);
    assert!(!pedersen_counter::verify_opening(&commitment, 5, &wrong_blinding), 2);

    test_scenario::end(scenario);
}

#[test]
fun test_counter_creation_and_verification() {
    let mut scenario = test_scenario::begin(@0x1);
    let ctx = test_scenario::ctx(&mut scenario);

    // Create a counter with initial value 10
    let blinding = bls12381::scalar_from_u64(123);
    let commitment = pedersen_counter::commit(10, &blinding);
    let commitment_bytes = *commitment.bytes();
    let counter = pedersen_counter::new(commitment_bytes, ctx);

    // Verify the counter value
    assert!(pedersen_counter::verify_counter_value(&counter, 10, &blinding), 0);

    pedersen_counter::destroy_for_testing(counter);
    test_scenario::end(scenario);
}

#[test]
fun test_homomorphic_increment() {
    let mut scenario = test_scenario::begin(@0x1);
    let ctx = test_scenario::ctx(&mut scenario);

    // Create counter with value 5
    let blinding1 = bls12381::scalar_from_u64(100);
    let commitment1 = pedersen_counter::commit(5, &blinding1);
    let commitment1_bytes = *commitment1.bytes();
    let mut counter = pedersen_counter::new(commitment1_bytes, ctx);

    // Create increment commitment for value 3
    let blinding2 = bls12381::scalar_from_u64(200);
    let increment_commitment = pedersen_counter::commit(3, &blinding2);
    let increment_bytes = *increment_commitment.bytes();

    // Increment homomorphically
    counter.increment(increment_bytes);

    // The new value should be 8 with combined blinding (100 + 200 = 300)
    let combined_blinding = bls12381::scalar_add(&blinding1, &blinding2);
    assert!(pedersen_counter::verify_counter_value(&counter, 8, &combined_blinding), 0);

    pedersen_counter::destroy_for_testing(counter);
    test_scenario::end(scenario);
}

#[test]
fun test_multiple_increments() {
    let mut scenario = test_scenario::begin(@0x1);
    let ctx = test_scenario::ctx(&mut scenario);

    // Start with value 0
    let mut total_blinding = bls12381::scalar_from_u64(0);
    let commitment = pedersen_counter::commit(0, &total_blinding);
    let commitment_bytes = *commitment.bytes();
    let mut counter = pedersen_counter::new(commitment_bytes, ctx);

    // Increment 5 times
    let mut i = 0;
    while (i < 5) {
        let increment_blinding = bls12381::scalar_from_u64(i + 1);
        let increment_commitment = pedersen_counter::commit(1, &increment_blinding);
        let increment_bytes = *increment_commitment.bytes();
        counter.increment(increment_bytes);
        total_blinding = bls12381::scalar_add(&total_blinding, &increment_blinding);
        i = i + 1;
    };

    // Final value should be 5 with accumulated blinding (0+1+2+3+4+5 = 15)
    assert!(pedersen_counter::verify_counter_value(&counter, 5, &total_blinding), 0);

    pedersen_counter::destroy_for_testing(counter);
    test_scenario::end(scenario);
}

#[test]
fun test_commitment_privacy() {
    let mut scenario = test_scenario::begin(@0x1);
    let ctx = test_scenario::ctx(&mut scenario);

    // Create two counters with same value but different blinding factors
    let blinding1 = bls12381::scalar_from_u64(111);
    let commitment1 = pedersen_counter::commit(42, &blinding1);
    let bytes1 = *commitment1.bytes();
    let counter1 = pedersen_counter::new(bytes1, ctx);

    let blinding2 = bls12381::scalar_from_u64(222);
    let commitment2 = pedersen_counter::commit(42, &blinding2);
    let bytes2 = *commitment2.bytes();
    let counter2 = pedersen_counter::new(bytes2, ctx);

    // The commitments should be different (privacy property)
    let counter_bytes1 = counter1.commitment_bytes();
    let counter_bytes2 = counter2.commitment_bytes();
    assert!(counter_bytes1 != counter_bytes2, 0);

    // But both should open to the same value with their respective blinding factors
    assert!(pedersen_counter::verify_counter_value(&counter1, 42, &blinding1), 1);
    assert!(pedersen_counter::verify_counter_value(&counter2, 42, &blinding2), 2);

    pedersen_counter::destroy_for_testing(counter1);
    pedersen_counter::destroy_for_testing(counter2);
    test_scenario::end(scenario);
}
