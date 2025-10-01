pragma circom 2.1.5;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

/// Private Counter ZK Circuit (+1 increment only)
///
/// This circuit proves:
/// 1. Knowledge of salt: Poseidon(salt) == salt_hash
/// 2. Valid old commitment: Poseidon(old_value, old_randomness) == old_hash
/// 3. +1 increment constraint: new_value == old_value + 1
/// 4. New commitment: Poseidon(new_value, new_randomness) == new_hash
/// 5. Range constraint: old_value < 2^64 (prevent overflow)
///
/// Compatible with Sui's private_counter.move module
template PrivateCounter() {
    // ========== Private Inputs (Witness) ==========
    signal input salt;
    signal input old_value;
    signal input old_randomness;
    signal input new_randomness;

    // ========== Public Inputs ==========
    signal input salt_hash;
    signal input old_hash;
    signal input new_hash;

    // ========== Constraint 1: Salt Verification ==========
    // Prove knowledge of salt: Poseidon(salt) == salt_hash
    component salt_hasher = Poseidon(1);
    salt_hasher.inputs[0] <== salt;
    salt_hash === salt_hasher.out;

    // ========== Constraint 2: Old Commitment Verification ==========
    // Prove old_hash matches: Poseidon(old_value, old_randomness) == old_hash
    component old_hasher = Poseidon(2);
    old_hasher.inputs[0] <== old_value;
    old_hasher.inputs[1] <== old_randomness;
    old_hash === old_hasher.out;

    // ========== Constraint 3: +1 Increment Enforcement ==========
    // Enforce exactly +1 increment (not +2, not -1)
    signal new_value;
    new_value <== old_value + 1;

    // ========== Constraint 4: New Commitment Generation ==========
    // Generate new_hash: Poseidon(new_value, new_randomness) == new_hash
    component new_hasher = Poseidon(2);
    new_hasher.inputs[0] <== new_value;
    new_hasher.inputs[1] <== new_randomness;
    new_hash === new_hasher.out;

    // ========== Constraint 5: Range Check ==========
    // Ensure old_value < 2^64 to prevent overflow
    // Using LessThan with 64 bits
    component range_check = LessThan(65);
    range_check.in[0] <== old_value;
    range_check.in[1] <== 18446744073709551616; // 2^64
    range_check.out === 1;
}

// Main component with public inputs declaration
component main {public [salt_hash, old_hash, new_hash]} = PrivateCounter();
