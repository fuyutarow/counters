// Test to verify PackageID handling in Multi-IBS counter implementation
// Includes TypeScript calculation values for reproducibility
module counter::package_id_verification_test;

use std::debug;
use sui::{address, bls12381::hash_to_g1, hex};

const DOMAIN_SEPARATOR_BLS: vector<u8> = b"SUI-MULTI-IBS-V1";
const SEAL_DST_ID: vector<u8> = b"SUI-SEAL-IBE-BLS12381-00";

#[test]
public fun test_typescript_vs_move_id_construction() {
    debug::print(&b"=== TypeScript vs Move ID Construction Test ===");

    // Fixed test values (same as TypeScript calculation)
    let counter_id_bytes = x"70fd563ae69f17caf9d6c05145a2c7643d3c3c3564a227820bfa5fe728e8a1c9";
    let signer = @0x50e77137cc4501330fa0096be9363662c360813885bf74d44b2669ba6bc28e42;
    let message = b"test-message";
    let package_id = @0x5d45e77ee025e2cced39ddec320fc91d7ec1346f5cfc703b26259b36c88f17b9;

    debug::print(&b"Test inputs:");
    debug::print(&b"Counter ID: 70fd563ae69f17caf9d6c05145a2c7643d3c3c3564a227820bfa5fe728e8a1c9");
    debug::print(&b"Signer: 50e77137cc4501330fa0096be9363662c360813885bf74d44b2669ba6bc28e42");
    debug::print(&b"Message: test-message");
    debug::print(&b"Package ID: 5d45e77ee025e2cced39ddec320fc91d7ec1346f5cfc703b26259b36c88f17b9");

    // TypeScript calculation results (hardcoded for reproducibility)
    // These values were calculated using the following TypeScript code:
    // ```typescript
    // const counterIdBytes = Buffer.from("70fd563ae69f17caf9d6c05145a2c7643d3c3c3564a227820bfa5fe728e8a1c9", "hex");
    // const signerBytes = Buffer.from("50e77137cc4501330fa0096be9363662c360813885bf74d44b2669ba6bc28e42", "hex");
    // const messageBytes = Buffer.from("test-message", "utf-8");
    // const packageIdBytes = Buffer.from("5d45e77ee025e2cced39ddec320fc91d7ec1346f5cfc703b26259b36c88f17b9", "hex");
    // const domainBytes = Buffer.from("SUI-MULTI-IBS-V1", "utf-8");
    // const messageWithDomain = Buffer.concat([domainBytes, messageBytes]);
    // const innerIdBytes = Buffer.concat([counterIdBytes, signerBytes, messageWithDomain]);
    // const fullIdBytes = Buffer.concat([packageIdBytes, innerIdBytes]);
    // const dstBytes = Buffer.from("SUI-SEAL-IBE-BLS12381-00", "utf-8");
    // const hashInputBytes = Buffer.concat([dstBytes, fullIdBytes]);
    // ```
    // Results:
    // - InnerID (92 bytes): 70fd563a...746573742d6d657373616765
    // - FullID (124 bytes): 5d45e77e...746573742d6d657373616765
    // - Hash input (148 bytes): 5355492d...746573742d6d657373616765

    let ts_inner_id_hex =
        b"70fd563ae69f17caf9d6c05145a2c7643d3c3c3564a227820bfa5fe728e8a1c950e77137cc4501330fa0096be9363662c360813885bf74d44b2669ba6bc28e425355492d4d554c54492d4942532d5631746573742d6d657373616765";
    let ts_full_id_hex =
        b"5d45e77ee025e2cced39ddec320fc91d7ec1346f5cfc703b26259b36c88f17b970fd563ae69f17caf9d6c05145a2c7643d3c3c3564a227820bfa5fe728e8a1c950e77137cc4501330fa0096be9363662c360813885bf74d44b2669ba6bc28e425355492d4d554c54492d4942532d5631746573742d6d657373616765";
    let ts_hash_input_hex =
        b"5355492d5345414c2d4942452d424c5331323338312d30305d45e77ee025e2cced39ddec320fc91d7ec1346f5cfc703b26259b36c88f17b970fd563ae69f17caf9d6c05145a2c7643d3c3c3564a227820bfa5fe728e8a1c950e77137cc4501330fa0096be9363662c360813885bf74d44b2669ba6bc28e425355492d4d554c54492d4942532d5631746573742d6d657373616765";

    let ts_inner_id = hex::decode(ts_inner_id_hex);
    let ts_full_id = hex::decode(ts_full_id_hex);
    let ts_hash_input = hex::decode(ts_hash_input_hex);

    debug::print(&b"=== TypeScript Calculation (Expected) ===");
    debug::print(&b"InnerID length: 92 bytes");
    debug::print(&b"FullID length: 124 bytes");
    debug::print(&b"Hash input length: 148 bytes");

    // Move calculation (current implementation)
    let mut move_inner_id = counter_id_bytes;
    move_inner_id.append(address::to_bytes(signer));

    let mut message_with_domain = vector[];
    message_with_domain.append(DOMAIN_SEPARATOR_BLS);
    message_with_domain.append(message);
    move_inner_id.append(message_with_domain);

    let mut move_full_id = address::to_bytes(package_id);
    move_full_id.append(move_inner_id);

    let mut move_hash_input = SEAL_DST_ID;
    move_hash_input.append(move_full_id);

    debug::print(&b"=== Move Calculation (Actual) ===");
    debug::print(&b"InnerID length:");
    debug::print(&(move_inner_id.length() as u64));
    debug::print(&b"FullID length:");
    debug::print(&(move_full_id.length() as u64));
    debug::print(&b"Hash input length:");
    debug::print(&(move_hash_input.length() as u64));

    // Verify match
    assert!(ts_inner_id == move_inner_id, 0);
    assert!(ts_full_id == move_full_id, 0);
    assert!(ts_hash_input == move_hash_input, 0);

    debug::print(&b"✅ All values match!");

    // Calculate and show G1 hash
    let g1_hash = hash_to_g1(&move_hash_input);
    debug::print(&b"G1 hash (first 32 bytes):");
    let g1_bytes = g1_hash.bytes();
    let mut first_32 = vector[];
    let mut i = 0;
    while (i < 32 && i < g1_bytes.length()) {
        first_32.push_back(g1_bytes[i]);
        i = i + 1;
    };
    debug::print(&hex::encode(first_32));
}

#[test]
public fun test_package_id_changes_hash() {
    debug::print(&b"=== PackageID Impact on Hash Test ===");

    let counter_id_bytes = x"70fd563ae69f17caf9d6c05145a2c7643d3c3c3564a227820bfa5fe728e8a1c9";
    let signer = @0x50e77137cc4501330fa0096be9363662c360813885bf74d44b2669ba6bc28e42;
    let message = b"test-message";
    let package_id = @0x5d45e77ee025e2cced39ddec320fc91d7ec1346f5cfc703b26259b36c88f17b9;

    // Build InnerID
    let mut inner_id = counter_id_bytes;
    inner_id.append(address::to_bytes(signer));
    let mut message_with_domain = vector[];
    message_with_domain.append(DOMAIN_SEPARATOR_BLS);
    message_with_domain.append(message);
    inner_id.append(message_with_domain);

    // Hash WITHOUT PackageID (incorrect)
    let mut hash_without_pkg = SEAL_DST_ID;
    hash_without_pkg.append(inner_id);
    let g1_without = hash_to_g1(&hash_without_pkg);

    // Hash WITH PackageID (correct)
    let mut full_id = address::to_bytes(package_id);
    full_id.append(inner_id);
    let mut hash_with_pkg = SEAL_DST_ID;
    hash_with_pkg.append(full_id);
    let g1_with = hash_to_g1(&hash_with_pkg);

    // Verify they produce different results
    assert!(g1_without.bytes() != g1_with.bytes(), 0);

    debug::print(&b"✅ Confirmed: PackageID inclusion changes the hash result");
    debug::print(&b"Without PackageID - length:");
    debug::print(&(hash_without_pkg.length() as u64)); // 116 bytes
    debug::print(&b"With PackageID - length:");
    debug::print(&(hash_with_pkg.length() as u64)); // 148 bytes
}
