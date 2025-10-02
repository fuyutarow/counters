/**
 * Arkworks WASM Converter Tests
 *
 * Verifies that WASM converter produces identical output to Rust CLI
 *
 * Note: This test uses Node.js native WASM loading, not browser environment
 */

import assert from "node:assert";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { type SnarkjsProof } from "@/utils/arkworks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONVERT_PROOF_PATH = path.join(
  __dirname,
  "..",
  "..",
  "circuits",
  "convert-vk",
  "target",
  "release",
  "convert-proof",
);

// Node.js用のWASMローダー
async function loadWasmModule() {
  const wasmPath = path.join(
    __dirname,
    "..",
    "..",
    "public",
    "wasm",
    "arkworks-converter",
    "arkworks-converter_bg.wasm",
  );
  const jsPath = path.join(
    __dirname,
    "..",
    "..",
    "public",
    "wasm",
    "arkworks-converter",
    "arkworks-converter.js",
  );

  // Dynamic import for ESM
  const module = await import(jsPath);

  // Read WASM binary
  const wasmBinary = readFileSync(wasmPath);

  // Initialize with buffer
  await module.default(wasmBinary);

  return module;
}

describe("Arkworks WASM Converter", () => {
  let wasmModule: any;
  // Real proof from circuits/proofs/proof.json
  const testProof: SnarkjsProof = {
    pi_a: [
      "11911437424818361641994442632530927780858181473895658001677164167999983738462",
      "12361978769505898073560549274282030044781292399559372182518277971626503210787",
      "1",
    ],
    pi_b: [
      [
        "13980890066403872948473759900707576118195472912489953112503625823844558837953",
        "2479690265752735949545826205540166043642215224158291531276138737056809973703",
      ],
      [
        "14210885099500426613648868064307469530840243120492554125784562872606688624341",
        "16619642144279683986897987141606383464176242444463822113504150326582839300536",
      ],
      ["1", "0"],
    ],
    pi_c: [
      "21211278642196985285866820289311805802922719926196065093287545570210447347111",
      "12531862956248896162112617521815189328098755041757999563043101820208548069254",
      "1",
    ],
    protocol: "groth16",
    curve: "bn128",
  };

  it("should produce exactly 128 bytes", async () => {
    if (!wasmModule) {
      wasmModule = await loadWasmModule();
    }

    const proofJson = JSON.stringify(testProof);
    const bytes = wasmModule.convert_proof_to_arkworks(proofJson);
    assert.strictEqual(bytes.length, 128, "Proof must be exactly 128 bytes");
  });

  it("should produce identical output to Rust CLI", async () => {
    if (!wasmModule) {
      wasmModule = await loadWasmModule();
    }

    // WASM conversion
    const proofJson = JSON.stringify(testProof);
    const wasmBytes = wasmModule.convert_proof_to_arkworks(proofJson);

    // CLI conversion (reference)
    const testProofPath = "/tmp/test-proof-wasm.json";
    const testProofBinPath = "/tmp/test-proof-wasm.bin";

    writeFileSync(testProofPath, JSON.stringify(testProof, null, 2));
    execSync(`${CONVERT_PROOF_PATH} ${testProofPath} ${testProofBinPath}`, {
      stdio: "ignore",
    });
    const cliBytes = readFileSync(testProofBinPath);

    // Compare byte-by-byte
    assert.strictEqual(
      wasmBytes.length,
      cliBytes.length,
      "WASM and CLI outputs must have same length",
    );

    for (let i = 0; i < wasmBytes.length; i++) {
      assert.strictEqual(
        wasmBytes[i],
        cliBytes[i],
        `Byte mismatch at index ${i}: WASM=${wasmBytes[i]}, CLI=${cliBytes[i]}`,
      );
    }
  });

  it("should handle invalid input gracefully", async () => {
    if (!wasmModule) {
      wasmModule = await loadWasmModule();
    }

    const invalidProof = {
      pi_a: ["invalid"],
      pi_b: [["1", "2"]],
      pi_c: ["1", "2", "3"],
      protocol: "groth16",
      curve: "bn128",
    } as any;

    assert.throws(
      () => wasmModule.convert_proof_to_arkworks(JSON.stringify(invalidProof)),
      /parse error|Failed to parse/i,
      "Should reject invalid proof",
    );
  });

  it("should produce consistent output across multiple calls", async () => {
    if (!wasmModule) {
      wasmModule = await loadWasmModule();
    }

    const proofJson = JSON.stringify(testProof);
    const bytes1 = wasmModule.convert_proof_to_arkworks(proofJson);
    const bytes2 = wasmModule.convert_proof_to_arkworks(proofJson);

    assert.deepStrictEqual(bytes1, bytes2, "Multiple calls should produce identical output");
  });
});
