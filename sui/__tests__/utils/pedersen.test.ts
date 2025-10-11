import { describe, expect, test } from "bun:test";
import {
  addCommitments,
  createCommitment,
  createSerializedCommitment,
  deserializePoint,
  generateBlindingFactor,
  serializeCommitment,
  verifyCommitment,
} from "@/utils/pedersen";

describe("Pedersen Commitment", () => {
  test("should create a commitment with value 0", () => {
    const commitment = createCommitment(0n);
    expect(commitment.value).toBe(0n);
    expect(commitment.blinding).toBeGreaterThan(0n);
    expect(verifyCommitment(commitment)).toBe(true);
  });

  test("should create a commitment with small value", () => {
    const commitment = createCommitment(5n);
    expect(commitment.value).toBe(5n);
    expect(verifyCommitment(commitment)).toBe(true);
  });

  test("should create a commitment with large value", () => {
    const commitment = createCommitment(123456789n);
    expect(commitment.value).toBe(123456789n);
    expect(verifyCommitment(commitment)).toBe(true);
  });

  test("should generate random blinding factors", () => {
    const r1 = generateBlindingFactor();
    const r2 = generateBlindingFactor();
    expect(r1).not.toBe(r2);
    expect(r1).toBeGreaterThan(0n);
    expect(r2).toBeGreaterThan(0n);
  });

  test("should create commitment with custom blinding", () => {
    const blinding = 42n;
    const commitment = createCommitment(10n, blinding);
    expect(commitment.blinding).toBe(42n);
    expect(commitment.value).toBe(10n);
  });

  test("should add commitments homomorphically", () => {
    const c1 = createCommitment(5n, 100n);
    const c2 = createCommitment(3n, 200n);
    const c3 = addCommitments(c1, c2);

    expect(c3.value).toBe(8n);
    expect(c3.blinding).toBe(300n);
    expect(verifyCommitment(c3)).toBe(true);
  });

  test("should serialize and deserialize commitment", () => {
    const commitment = createCommitment(42n);
    const bytes = serializeCommitment(commitment);

    expect(bytes.length).toBe(48); // Compressed G1 point

    const point = deserializePoint(bytes);
    expect(point.equals(commitment.point)).toBe(true);
  });

  test("should create serialized commitment for Sui", () => {
    const { commitment, bytes } = createSerializedCommitment(10n);

    expect(Array.isArray(bytes)).toBe(true);
    expect(bytes.length).toBe(48);
    expect(bytes.every((b) => typeof b === "number")).toBe(true);
    expect(verifyCommitment(commitment)).toBe(true);
  });

  test("should handle value 0 correctly", () => {
    const { commitment, bytes } = createSerializedCommitment(0n);
    expect(commitment.value).toBe(0n);
    expect(bytes.length).toBe(48);
  });
});
