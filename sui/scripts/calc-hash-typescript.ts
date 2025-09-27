/**
 * Calculate hash values on TypeScript side for Move unit test comparison
 */

const calculateHashTypescript = () => {
  // Fixed test values (same as Move test)
  const counterIdHex = "70fd563ae69f17caf9d6c05145a2c7643d3c3c3564a227820bfa5fe728e8a1c9";
  const signerHex = "50e77137cc4501330fa0096be9363662c360813885bf74d44b2669ba6bc28e42";
  const message = "test-message";
  const packageIdHex = "5d45e77ee025e2cced39ddec320fc91d7ec1346f5cfc703b26259b36c88f17b9";

  // Step 1: Convert to bytes
  const counterIdBytes = Buffer.from(counterIdHex, "hex");
  const signerBytes = Buffer.from(signerHex, "hex");
  const messageBytes = Buffer.from(message, "utf-8");
  const packageIdBytes = Buffer.from(packageIdHex, "hex");

  // Step 2: Build InnerID
  const DOMAIN_SEPARATOR = "SUI-MULTI-IBS-V1";
  const domainBytes = Buffer.from(DOMAIN_SEPARATOR, "utf-8");
  const messageWithDomain = Buffer.concat([domainBytes, messageBytes]);

  const innerIdBytes = Buffer.concat([counterIdBytes, signerBytes, messageWithDomain]);

  // Step 3: Build FullID (WITH PackageID)
  const fullIdBytes = Buffer.concat([packageIdBytes, innerIdBytes]);

  // Step 4: Hash input for hash_to_g1
  const SEAL_DST_ID = "SUI-SEAL-IBE-BLS12381-00";
  const dstBytes = Buffer.from(SEAL_DST_ID, "utf-8");
  const _hashInputCorrect = Buffer.concat([dstBytes, fullIdBytes]);

  // Step 5: Hash input WITHOUT PackageID (incorrect, for comparison)
  const _hashInputWrong = Buffer.concat([dstBytes, innerIdBytes]);
};

calculateHashTypescript();
