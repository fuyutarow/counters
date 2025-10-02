/**
 * Private Counter E2E Test
 *
 * Tests the full flow of creating and incrementing a private counter with ZK proofs
 */

import { beforeAll, describe, expect, it } from "bun:test";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { buildPoseidon } from "circomlibjs";
import { groth16 } from "snarkjs";
import { increment, _new as newPrivateCounter } from "@/generated/counter/private_counter";
import { networkConfig } from "@/networkConfig";
import {
  convertProofToArkworks,
  convertPublicInputsToBytes,
  type SnarkjsProof,
} from "@/utils/arkworks";
import { getCarol, type KeyInfo } from "./utils/keybook";

const COUNTER_PACKAGE_ID = networkConfig.testnet.variables.counterPackageId;

describe("Private Counter E2E", () => {
  let client: SuiClient;
  let keyInfo: KeyInfo;
  let poseidon: Awaited<ReturnType<typeof buildPoseidon>>;

  beforeAll(async () => {
    client = new SuiClient({ url: getFullnodeUrl("testnet") });

    // Use carol's keypair from keybook
    keyInfo = getCarol();

    // Build Poseidon for hashing
    poseidon = await buildPoseidon();
  });

  it("should create a private counter", async () => {
    const salt = BigInt(42);
    const initialValue = BigInt(0);

    // Compute hashes
    const initialValueDigest = poseidon([initialValue, salt]);
    const initialValueDigestBigInt = BigInt(poseidon.F.toString(initialValueDigest));

    const saltDigest = poseidon([salt]);
    const saltDigestBigInt = BigInt(poseidon.F.toString(saltDigest));

    // Create transaction
    const tx = new Transaction();
    const counter = newPrivateCounter({
      package: COUNTER_PACKAGE_ID,
      arguments: [initialValueDigestBigInt, saltDigestBigInt],
    })(tx);

    tx.transferObjects([counter], keyInfo.keypair.getPublicKey().toSuiAddress());

    // Execute transaction
    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: keyInfo.keypair,
      options: {
        showObjectChanges: true,
      },
    });

    const created = result.objectChanges?.find((c) => c.type === "created");
    expect(created).toBeDefined();
    expect(created?.type).toBe("created");

    if (created?.type === "created") {
    }
  });

  it("should increment private counter with ZK proof", async () => {
    const salt = BigInt(42);
    const oldValue = BigInt(0);

    // Compute old hashes
    const oldValueDigest = poseidon([oldValue, salt]);
    const oldHash = BigInt(poseidon.F.toString(oldValueDigest));

    const saltDigest = poseidon([salt]);
    const saltHash = BigInt(poseidon.F.toString(saltDigest));

    // Create counter first
    const tx1 = new Transaction();
    const counter = newPrivateCounter({
      package: COUNTER_PACKAGE_ID,
      arguments: [oldHash, saltHash],
    })(tx1);

    tx1.transferObjects([counter], keyInfo.keypair.getPublicKey().toSuiAddress());

    const createResult = await client.signAndExecuteTransaction({
      transaction: tx1,
      signer: keyInfo.keypair,
      options: {
        showObjectChanges: true,
      },
    });

    const created = createResult.objectChanges?.find((c) => c.type === "created");
    if (!created || created.type !== "created") {
      throw new Error("Failed to create counter");
    }

    const counterId = created.objectId;

    // Generate proof for increment
    const newValue = oldValue + 1n;
    const newValueDigest = poseidon([newValue, salt]);
    const newHash = BigInt(poseidon.F.toString(newValueDigest));

    const circuitInputs = {
      salt: salt.toString(),
      old_value: oldValue.toString(),
      old_randomness: salt.toString(),
      new_randomness: salt.toString(),
      salt_hash: saltHash.toString(),
      old_hash: oldHash.toString(),
      new_hash: newHash.toString(),
    };

    // Load circuit files from public/circuits directory
    const path = await import("node:path");
    const fs = await import("node:fs");

    const wasmPath = path.join(__dirname, "..", "..", "public", "circuits", "private_counter.wasm");
    const zkeyPath = path.join(
      __dirname,
      "..",
      "..",
      "public",
      "circuits",
      "private_counter_final.zkey",
    );

    const [wasmFile, zkeyFile] = await Promise.all([
      fs.promises.readFile(wasmPath),
      fs.promises.readFile(zkeyPath),
    ]);

    // Generate proof
    const { proof, publicSignals } = await groth16.fullProve(
      circuitInputs,
      new Uint8Array(wasmFile),
      new Uint8Array(zkeyFile),
    );

    const proofBytes = convertProofToArkworks(proof as SnarkjsProof);
    const publicInputsBytes = convertPublicInputsToBytes(publicSignals);

    // Create increment transaction
    const tx2 = new Transaction();

    increment({
      package: COUNTER_PACKAGE_ID,
      arguments: [tx2.object(counterId), Array.from(proofBytes), Array.from(publicInputsBytes)],
    })(tx2);

    // Execute increment
    const incrementResult = await client.signAndExecuteTransaction({
      transaction: tx2,
      signer: keyInfo.keypair,
      options: {
        showEffects: true,
      },
    });

    expect(incrementResult.effects?.status.status).toBe("success");
  }, 120000); // 120 second timeout for proof generation
});
