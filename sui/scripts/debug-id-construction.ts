/**
 * Debug script for ID construction comparison
 *
 * This script traces the ID construction process to compare with Move side
 */

const debugIdConstruction = () => {
  // Use fixed values for reproducible debugging
  const counterId = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const signerAddress = "0x5678901234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const message = "test-message";
  const packageId = "0x7944ccaf4ca075a91e739610e6158bde732f5c78dae3a250f435a4d078a6b846";

  // Step 1: Counter ID bytes (32 bytes)
  const counterIdBytes = Buffer.from(counterId.replace("0x", ""), "hex");

  // Step 2: Signer address bytes (32 bytes)
  const signerBytes = Buffer.from(signerAddress.replace("0x", ""), "hex");

  // Step 3: Message with domain separation
  const DOMAIN_SEPARATOR = "SUI-MULTI-IBS-V1";
  const domainBytes = Buffer.from(DOMAIN_SEPARATOR, "utf-8");
  const messageBytes = Buffer.from(message, "utf-8");
  const messageWithDomain = Buffer.concat([domainBytes, messageBytes]);

  // Step 4: InnerID construction (counter_id || signer || domain+message)
  const innerIdBytes = Buffer.concat([counterIdBytes, signerBytes, messageWithDomain]);

  // Step 5: Package ID bytes (32 bytes)
  const packageIdBytes = Buffer.from(packageId.replace("0x", ""), "hex");

  // Step 6: FullID construction (package_id || inner_id)
  const fullIdBytes = Buffer.concat([packageIdBytes, innerIdBytes]);

  // Step 7: Hash input for hash_to_g1
  const SEAL_DST = "SUI-SEAL-IBE-BLS12381-00";
  const sealDstBytes = Buffer.from(SEAL_DST, "utf-8");
  const _hashInput = Buffer.concat([sealDstBytes, fullIdBytes]);
};

// Run the debug function
debugIdConstruction();
