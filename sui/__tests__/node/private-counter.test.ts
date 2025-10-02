/**
 * Private Counter Node.js Reference Implementation
 *
 * This is the reference implementation for browser-side private counter operations.
 * Tests the complete flow of creating and incrementing a private counter with ZK proofs.
 *
 * This test runs in Node.js and can perform full proof generation using snarkjs.
 */

import assert from "node:assert";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { getFullnodeUrl, SuiClient, type SuiTransactionBlockResponse } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { buildPoseidon } from "circomlibjs";
import { groth16 } from "snarkjs";
import { increment, _new as newPrivateCounter } from "@/generated/counter/private_counter";
import { networkConfig } from "@/networkConfig";
import { convertPublicInputsToBytes, type SnarkjsProof, validateProof } from "@/utils/arkworks";
import { getCarol, type KeyInfo } from "../utils/keybook";

const COUNTER_PACKAGE_ID = networkConfig.testnet.variables.counterPackageId;

// Circuit file paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CIRCUIT_DIR = path.join(__dirname, "..", "..");
const WASM_PATH = path.join(CIRCUIT_DIR, "public", "circuits", "private_counter.wasm");
const ZKEY_PATH = path.join(CIRCUIT_DIR, "public", "circuits", "private_counter_final.zkey");

describe("Private Counter Reference Implementation (Node.js)", () => {
  let client: SuiClient;
  let keyInfo: KeyInfo;
  let poseidon: Awaited<ReturnType<typeof buildPoseidon>>;

  before(async () => {
    client = new SuiClient({ url: getFullnodeUrl("testnet") });
    keyInfo = getCarol();
    poseidon = await buildPoseidon();
  }, 30000); // 30 second timeout for setup

  /**
   * Helper: Execute transaction and wait for finalization
   */
  async function executeAndWait(tx: Transaction): Promise<SuiTransactionBlockResponse> {
    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: keyInfo.keypair,
      options: {
        showObjectChanges: true,
        showEffects: true,
      },
    });

    if (result.effects?.status.status !== "success") {
      const errorMsg = result.effects?.status.error || "Unknown error";
      throw new Error(`Transaction failed: ${errorMsg}`);
    }

    // Wait for transaction to be fully indexed (increased timeout for testnet)
    await client.waitForTransaction({
      digest: result.digest,
      timeout: 120000, // 120 seconds for testnet indexing
      pollInterval: 3000, // Poll every 3 seconds
    });

    return result;
  }

  /**
   * Helper: Generate random field element for BN254 scalar field
   */
  function generateRandomFieldElement(): bigint {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const fieldOrder = BigInt(
      "21888242871839275222246405745257275088548364400416034343698204186575808495617",
    );
    let value = BigInt(0);
    for (let i = 0; i < 32; i++) {
      const byte = bytes[i];
      if (byte === undefined) throw new Error("Invalid byte array");
      value = (value << BigInt(8)) | BigInt(byte);
    }
    return value % fieldOrder;
  }

  /**
   * Helper: Compute Poseidon hash
   */
  function computePoseidonHash(inputs: bigint[]): bigint {
    const hash = poseidon(inputs);
    return BigInt(poseidon.F.toString(hash));
  }

  /**
   * Helper: Generate ZK proof for private counter increment
   * Note: Uses salt as randomness for both old and new commitments
   */
  async function generateIncrementProof(params: {
    salt: bigint;
    oldValue: bigint;
    saltHash: bigint;
    oldHash: bigint;
  }): Promise<{
    proof: SnarkjsProof;
    publicSignals: string[];
    newHash: bigint;
    newValue: bigint;
    proofBytes: Uint8Array;
    publicInputsBytes: Uint8Array;
  }> {
    // Compute new value and hash (using salt as randomness)
    const newValue = params.oldValue + 1n;
    const newHash = computePoseidonHash([newValue, params.salt]);

    // Prepare circuit inputs (salt is used for both old and new commitments)
    const circuitInputs = {
      salt: params.salt.toString(),
      old_value: params.oldValue.toString(),
      salt_hash: params.saltHash.toString(),
      old_hash: params.oldHash.toString(),
      new_hash: newHash.toString(),
    };

    // Generate proof - pass file paths directly for better performance
    const { proof, publicSignals } = await groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);

    // Validate proof structure
    validateProof(proof as SnarkjsProof);

    // Save proof to temp file for Rust conversion
    const proofJsonPath = "/tmp/proof-node-test.json";
    const proofBinPath = "/tmp/proof-node-test.bin";
    writeFileSync(proofJsonPath, JSON.stringify(proof, null, 2));

    // Convert to Arkworks format using Rust tool (correct implementation)
    const convertProofPath = path.join(
      __dirname,
      "..",
      "..",
      "wasm",
      "bn254-groth16-arkworks-serializer",
      "target",
      "release",
      "convert-proof",
    );
    execSync(`${convertProofPath} ${proofJsonPath} ${proofBinPath}`, { stdio: "ignore" });

    // Read converted proof bytes
    const proofBytes = new Uint8Array(readFileSync(proofBinPath));

    // Convert public inputs
    const publicInputsBytes = convertPublicInputsToBytes(publicSignals);

    return {
      proof: proof as SnarkjsProof,
      publicSignals,
      newHash,
      newValue,
      proofBytes,
      publicInputsBytes,
    };
  }

  it("should create a private counter with Poseidon commitments", async () => {
    // Generate initial secrets
    const salt = generateRandomFieldElement();
    const initialValue = BigInt(0);

    // Compute commitments using Poseidon hash
    // value_digest = Poseidon(value, salt)
    const initialValueDigest = computePoseidonHash([initialValue, salt]);

    // salt_digest = Poseidon(salt)
    const saltDigest = computePoseidonHash([salt]);

    // Create transaction
    const tx = new Transaction();
    const counter = newPrivateCounter({
      package: COUNTER_PACKAGE_ID,
      arguments: [initialValueDigest, saltDigest],
    })(tx);

    // Transfer counter to owner
    tx.transferObjects([counter], keyInfo.keypair.getPublicKey().toSuiAddress());

    // Execute transaction and wait for finalization
    const result = await executeAndWait(tx);

    // Verify counter was created
    const created = result.objectChanges?.find((c) => c.type === "created");
    assert.ok(created, "Counter should be created");
    assert.strictEqual(created?.type, "created");

    if (created?.type === "created") {
      const counterId = created.objectId;
      assert.ok(counterId, "Counter ID should exist");

      // Verify on-chain state
      const obj = await client.getObject({
        id: counterId,
        options: { showContent: true },
      });

      assert.strictEqual(obj.data?.content?.dataType, "moveObject");

      if (obj.data?.content && obj.data.content.dataType === "moveObject") {
        const fields = obj.data.content.fields as {
          value_digest: string;
          salt_digest: string;
        };

        // Verify commitments match
        assert.strictEqual(fields.salt_digest, saltDigest.toString());
        assert.strictEqual(fields.value_digest, initialValueDigest.toString());
      }
    }
  }, 30000);

  it("should increment private counter with ZK proof verification", async () => {
    const salt = generateRandomFieldElement();
    const oldValue = BigInt(0);

    const oldHash = computePoseidonHash([oldValue, salt]);
    const saltHash = computePoseidonHash([salt]);

    // Create counter
    const tx1 = new Transaction();
    const counter = newPrivateCounter({
      package: COUNTER_PACKAGE_ID,
      arguments: [oldHash, saltHash],
    })(tx1);

    tx1.transferObjects([counter], keyInfo.keypair.getPublicKey().toSuiAddress());

    const createResult = await executeAndWait(tx1);

    const created = createResult.objectChanges?.find((c) => c.type === "created");
    if (!created || created.type !== "created") {
      throw new Error("Failed to create counter");
    }

    const counterId = created.objectId;
    assert.ok(counterId, "Counter ID should exist");
    const initialObj = await client.getObject({
      id: counterId,
      options: { showContent: true },
    });

    assert.strictEqual(initialObj.data?.content?.dataType, "moveObject");

    if (initialObj.data?.content && initialObj.data.content.dataType === "moveObject") {
      const fields = initialObj.data.content.fields as {
        value_digest: string;
        salt_digest: string;
      };
      assert.strictEqual(fields.salt_digest, saltHash.toString());
      assert.strictEqual(fields.value_digest, oldHash.toString());
    }
    const startProof = Date.now();
    const proofResult = await generateIncrementProof({
      salt,
      oldValue,
      saltHash,
      oldHash,
    });
    const _proofTime = Date.now() - startProof;

    assert.strictEqual(proofResult.newValue, oldValue + 1n);
    assert.strictEqual(proofResult.proofBytes.length, 128); // Arkworks compressed format
    assert.strictEqual(proofResult.publicInputsBytes.length, 96); // 3 public inputs × 32 bytes
    assert.strictEqual(proofResult.publicSignals[0], saltHash.toString());
    assert.strictEqual(proofResult.publicSignals[1], oldHash.toString());
    assert.strictEqual(proofResult.publicSignals[2], proofResult.newHash.toString());

    const tx2 = new Transaction();

    increment({
      package: COUNTER_PACKAGE_ID,
      arguments: [
        tx2.object(counterId),
        Array.from(proofResult.proofBytes),
        Array.from(proofResult.publicInputsBytes),
      ],
    })(tx2);

    const incrementResult = await executeAndWait(tx2);

    assert.strictEqual(incrementResult.effects?.status.status, "success");
    const updatedObj = await client.getObject({
      id: counterId,
      options: { showContent: true },
    });

    if (updatedObj.data?.content && updatedObj.data.content.dataType === "moveObject") {
      const updatedFields = updatedObj.data.content.fields as {
        value_digest: string;
        salt_digest: string;
      };

      // Salt digest should remain unchanged
      assert.strictEqual(updatedFields.salt_digest, saltHash.toString());

      // Value digest should be updated to new hash
      assert.strictEqual(updatedFields.value_digest, proofResult.newHash.toString());
      assert.notStrictEqual(updatedFields.value_digest, oldHash.toString());
    }
  }, 120000);

  it("should support multiple increments with different proofs", async () => {
    // ===== Create Counter =====
    const salt = generateRandomFieldElement();
    let currentValue = BigInt(0);

    const initialHash = computePoseidonHash([currentValue, salt]);
    const saltHash = computePoseidonHash([salt]);

    const tx1 = new Transaction();
    const counter = newPrivateCounter({
      package: COUNTER_PACKAGE_ID,
      arguments: [initialHash, saltHash],
    })(tx1);

    tx1.transferObjects([counter], keyInfo.keypair.getPublicKey().toSuiAddress());

    const createResult = await executeAndWait(tx1);

    const created = createResult.objectChanges?.find((c) => c.type === "created");
    if (!created || created.type !== "created") {
      throw new Error("Failed to create counter");
    }

    const counterId = created.objectId;
    let currentHash = initialHash;

    // ===== Increment 3 times =====
    const NUM_INCREMENTS = 3;

    for (let i = 0; i < NUM_INCREMENTS; i++) {
      // Generate proof for current state
      const proofResult = await generateIncrementProof({
        salt,
        oldValue: currentValue,
        saltHash,
        oldHash: currentHash,
      });

      // Execute increment
      const tx = new Transaction();
      increment({
        package: COUNTER_PACKAGE_ID,
        arguments: [
          tx.object(counterId),
          Array.from(proofResult.proofBytes),
          Array.from(proofResult.publicInputsBytes),
        ],
      })(tx);

      const result = await executeAndWait(tx);

      assert.strictEqual(result.effects?.status.status, "success");

      // Update state for next iteration
      currentValue = proofResult.newValue;
      currentHash = proofResult.newHash;
    }

    // Verify final state
    assert.strictEqual(currentValue, BigInt(NUM_INCREMENTS));

    const finalObj = await client.getObject({
      id: counterId,
      options: { showContent: true },
    });

    if (finalObj.data?.content && finalObj.data.content.dataType === "moveObject") {
      const fields = finalObj.data.content.fields as {
        value_digest: string;
        salt_digest: string;
      };

      assert.strictEqual(fields.value_digest, currentHash.toString());
      assert.strictEqual(fields.salt_digest, saltHash.toString());
    }
  }, 300000);

  it("should reject proof with incorrect old hash", async () => {
    // Create counter
    const salt = generateRandomFieldElement();
    const actualValue = BigInt(0);
    const actualHash = computePoseidonHash([actualValue, salt]);
    const saltHash = computePoseidonHash([salt]);

    const tx1 = new Transaction();
    const counter = newPrivateCounter({
      package: COUNTER_PACKAGE_ID,
      arguments: [actualHash, saltHash],
    })(tx1);

    tx1.transferObjects([counter], keyInfo.keypair.getPublicKey().toSuiAddress());

    const createResult = await executeAndWait(tx1);

    const created = createResult.objectChanges?.find((c) => c.type === "created");
    if (!created || created.type !== "created") {
      throw new Error("Failed to create counter");
    }

    const counterId = created.objectId;

    // Generate proof with WRONG old value (should fail verification)
    const wrongOldValue = BigInt(5); // Actual is 0
    const wrongOldHash = computePoseidonHash([wrongOldValue, salt]);

    const proofResult = await generateIncrementProof({
      salt,
      oldValue: wrongOldValue,
      saltHash,
      oldHash: wrongOldHash,
    });

    // Try to increment with invalid proof
    const tx2 = new Transaction();
    increment({
      package: COUNTER_PACKAGE_ID,
      arguments: [
        tx2.object(counterId),
        Array.from(proofResult.proofBytes),
        Array.from(proofResult.publicInputsBytes),
      ],
    })(tx2);

    // This should fail because proof's old_hash doesn't match on-chain value_digest
    await assert.rejects(executeAndWait(tx2));
  }, 120000);
});
