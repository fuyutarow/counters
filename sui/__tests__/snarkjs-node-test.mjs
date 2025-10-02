import { groth16 } from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
	console.log("🔐 Testing ZK Proof Generation with snarkjs\n");

	// ========== Step 1: Prepare inputs ==========
	const salt = 12345n;
	const oldValue = 0n;
	const oldRandomness = 987654321n;
	const newRandomness = 123456789n;

	// Compute hashes using Poseidon
	console.log("Computing Poseidon hashes...");
	const poseidonHash = await buildPoseidon();
	const F = poseidonHash.F;

	const saltHash = F.toString(poseidonHash([salt]));
	const oldHash = F.toString(poseidonHash([oldValue, oldRandomness]));
	const newValue = oldValue + 1n;
	const newHash = F.toString(poseidonHash([newValue, newRandomness]));

	console.log("Inputs:");
	console.log("  salt:", salt.toString());
	console.log("  old_value:", oldValue.toString());
	console.log("  new_value:", newValue.toString());
	console.log("  salt_hash:", saltHash);
	console.log("  old_hash:", oldHash);
	console.log("  new_hash:", newHash);

	// ========== Step 2: Prepare circuit inputs ==========
	const inputs = {
		salt: salt.toString(),
		old_value: oldValue.toString(),
		old_randomness: oldRandomness.toString(),
		new_randomness: newRandomness.toString(),
		salt_hash: saltHash,
		old_hash: oldHash,
		new_hash: newHash,
	};

	// ========== Step 3: Load circuit files ==========
	const wasmPath = join(__dirname, "..", "public", "circuits", "private_counter.wasm");
	const zkeyPath = join(__dirname, "..", "public", "circuits", "private_counter_final.zkey");

	console.log("\n📁 Loading circuit files:");
	console.log("  WASM:", wasmPath);
	console.log("  zkey:", zkeyPath);

	// ========== Step 4: Generate proof ==========
	console.log("\n⏳ Generating proof (this may take a while)...");
	const start = Date.now();

	const { proof, publicSignals } = await groth16.fullProve(
		inputs,
		wasmPath,
		zkeyPath,
	);

	const duration = ((Date.now() - start) / 1000).toFixed(2);
	console.log(`✅ Proof generated in ${duration}s\n`);

	console.log("Proof:");
	console.log("  pi_a:", proof.pi_a);
	console.log("  pi_b:", proof.pi_b);
	console.log("  pi_c:", proof.pi_c);
	console.log("  protocol:", proof.protocol);
	console.log("  curve:", proof.curve);

	console.log("\nPublic signals:", publicSignals);

	// ========== Step 5: Verify the proof ==========
	const vkeyPath = join(__dirname, "../circuits/keys/private_counter_vk.json");
	const vkey = JSON.parse(readFileSync(vkeyPath, "utf-8"));

	console.log("\n🔍 Verifying proof...");
	const isValid = await groth16.verify(vkey, publicSignals, proof);

	console.log("Verification result:", isValid ? "✅ VALID" : "❌ INVALID");

	// ========== Assertions ==========
	if (!isValid) {
		throw new Error("Proof verification failed!");
	}
	if (publicSignals.length !== 3) {
		throw new Error(`Expected 3 public signals, got ${publicSignals.length}`);
	}
	if (publicSignals[0] !== saltHash) {
		throw new Error("Public signal[0] (salt_hash) mismatch");
	}
	if (publicSignals[1] !== oldHash) {
		throw new Error("Public signal[1] (old_hash) mismatch");
	}
	if (publicSignals[2] !== newHash) {
		throw new Error("Public signal[2] (new_hash) mismatch");
	}

	console.log("\n🎉 All tests passed!");
}

main().catch((err) => {
	console.error("\n❌ Test failed:", err);
	process.exit(1);
});
