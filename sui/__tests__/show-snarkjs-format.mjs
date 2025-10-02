import { groth16 } from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  
  const salt = 42n;
  const oldValue = 0n;
  const saltHash = F.toString(poseidon([salt]));
  const oldHash = F.toString(poseidon([oldValue, salt]));
  const newHash = F.toString(poseidon([oldValue + 1n, salt]));
  
  const inputs = {
    salt: salt.toString(),
    old_value: oldValue.toString(),
    salt_hash: saltHash,
    old_hash: oldHash,
    new_hash: newHash,
  };
  
  const wasmPath = join(__dirname, "..", "public", "circuits", "private_counter.wasm");
  const zkeyPath = join(__dirname, "..", "public", "circuits", "private_counter_final.zkey");
  
  const { proof } = await groth16.fullProve(inputs, wasmPath, zkeyPath);
  
  console.log("\n📊 snarkjs Proof Format:");
  console.log("========================");
  console.log("\npi_a (G1 point):");
  console.log("  Type: Array of 3 decimal strings");
  console.log("  Format: [x, y, 1]");
  console.log("  Example:", proof.pi_a);
  
  console.log("\npi_b (G2 point):");
  console.log("  Type: Array of 3 arrays");
  console.log("  Format: [[x_c0, x_c1], [y_c0, y_c1], [1, 0]]");
  console.log("  Example:", proof.pi_b);
  
  console.log("\npi_c (G1 point):");
  console.log("  Type: Array of 3 decimal strings");
  console.log("  Format: [x, y, 1]");
  console.log("  Example:", proof.pi_c);
  
  console.log("\n🔧 Arkworks Compressed Format Required:");
  console.log("========================================");
  console.log("G1: 32 bytes (x-coordinate + sign bit for y)");
  console.log("G2: 64 bytes (x_c0 + x_c1 + sign bit for y)");
  console.log("Total: 128 bytes (pi_a: 32 + pi_b: 64 + pi_c: 32)");
  
  console.log("\n❌ snarkjs provides: Decimal string coordinates");
  console.log("✅ Sui needs: Binary compressed bytes");
  console.log("\n➡️  Conversion is ABSOLUTELY REQUIRED");
}

main().catch(console.error);
