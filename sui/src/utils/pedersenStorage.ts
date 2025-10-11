/**
 * Pedersen Counter Secrets Storage
 *
 * Manages localStorage for Pedersen commitment secrets (values and blinding factors).
 * This allows users to "open" (reveal) their committed values later.
 *
 * SECURITY WARNING:
 * - Data is stored in browser localStorage in PLAINTEXT
 * - Secrets are NOT encrypted
 * - If localStorage is cleared, secrets are PERMANENTLY LOST
 * - Secrets are device/browser-specific (not synced across devices)
 */

import consola from "consola";
import { Result } from "neverthrow";
import { z } from "zod";

const STORAGE_KEY = "pedersen_secrets";

// Zod schemas for validation
const IncrementRecordSchema = z.object({
  value: z.string(), // BigInt as string
  blinding: z.string(), // BigInt as string
  timestamp: z.number(),
  txDigest: z.string().optional(),
});

const CounterSecretsSchema = z.object({
  initialValue: z.string(), // BigInt as string
  initialBlinding: z.string(), // BigInt as string
  increments: z.array(IncrementRecordSchema),
  createdAt: z.number(),
});

const StorageSchema = z.record(z.string(), CounterSecretsSchema);

export type IncrementRecord = z.infer<typeof IncrementRecordSchema>;
export type CounterSecrets = z.infer<typeof CounterSecretsSchema>;

/**
 * Get all stored secrets from localStorage
 */
function getStorage(): Record<string, CounterSecrets> {
  const result = Result.fromThrowable(
    () => {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return {};

      const parsed = JSON.parse(data);
      const validated = StorageSchema.safeParse(parsed);

      if (!validated.success) {
        consola.warn("[pedersenStorage] Invalid storage data, resetting:", validated.error);
        return {};
      }

      return validated.data;
    },
    (error) => new Error(error instanceof Error ? error.message : String(error)),
  )();

  if (result.isErr()) {
    consola.error("[pedersenStorage] Failed to read storage:", result.error);
    return {};
  }

  return result.value;
}

/**
 * Save storage to localStorage
 */
function setStorage(data: Record<string, CounterSecrets>): void {
  const result = Result.fromThrowable(
    () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },
    (error) => new Error(error instanceof Error ? error.message : String(error)),
  )();

  if (result.isErr()) {
    consola.error("[pedersenStorage] Failed to write storage:", result.error);
    throw new Error("Failed to save secrets to localStorage");
  }
}

/**
 * Save initial counter secrets (at creation time)
 */
export function saveCounterSecrets(
  counterId: string,
  initialValue: bigint,
  initialBlinding: bigint,
): void {
  const storage = getStorage();

  storage[counterId] = {
    initialValue: initialValue.toString(),
    initialBlinding: initialBlinding.toString(),
    increments: [],
    createdAt: Date.now(),
  };

  setStorage(storage);
  consola.info(`[pedersenStorage] Saved secrets for counter ${counterId}`);
}

/**
 * Add an increment record to existing counter
 */
export function addIncrementRecord(
  counterId: string,
  value: bigint,
  blinding: bigint,
  txDigest?: string,
): void {
  const storage = getStorage();

  if (!storage[counterId]) {
    consola.warn(`[pedersenStorage] Counter ${counterId} not found, cannot add increment`);
    return;
  }

  storage[counterId].increments.push({
    value: value.toString(),
    blinding: blinding.toString(),
    timestamp: Date.now(),
    txDigest,
  });

  setStorage(storage);
  consola.info(`[pedersenStorage] Added increment to counter ${counterId}`);
}

/**
 * Get secrets for a specific counter
 */
export function getCounterSecrets(counterId: string): CounterSecrets | null {
  const storage = getStorage();
  return storage[counterId] || null;
}

/**
 * Check if secrets exist for a counter
 */
export function hasSecrets(counterId: string): boolean {
  const storage = getStorage();
  return !!storage[counterId];
}

/**
 * Calculate total value and blinding from stored secrets
 */
export function calculateTotals(counterId: string): {
  totalValue: bigint;
  totalBlinding: bigint;
} | null {
  const secrets = getCounterSecrets(counterId);
  if (!secrets) return null;

  let totalValue = BigInt(secrets.initialValue);
  let totalBlinding = BigInt(secrets.initialBlinding);

  for (const inc of secrets.increments) {
    totalValue += BigInt(inc.value);
    totalBlinding += BigInt(inc.blinding);
  }

  return { totalValue, totalBlinding };
}

/**
 * Delete secrets for a specific counter
 */
export function deleteCounterSecrets(counterId: string): void {
  const storage = getStorage();
  delete storage[counterId];
  setStorage(storage);
  consola.info(`[pedersenStorage] Deleted secrets for counter ${counterId}`);
}

/**
 * Export all secrets as JSON (for backup)
 */
export function exportAllSecrets(): string {
  const storage = getStorage();
  return JSON.stringify(storage, null, 2);
}

/**
 * Import secrets from JSON (restore from backup)
 */
export function importSecrets(jsonData: string): void {
  const result = Result.fromThrowable(
    () => {
      const parsed = JSON.parse(jsonData);
      const validated = StorageSchema.safeParse(parsed);

      if (!validated.success) {
        throw new Error("Invalid secrets format");
      }

      setStorage(validated.data);
      consola.info("[pedersenStorage] Imported secrets successfully");
    },
    (error) => new Error(error instanceof Error ? error.message : String(error)),
  )();

  if (result.isErr()) {
    consola.error("[pedersenStorage] Failed to import secrets:", result.error);
    throw new Error("Failed to import secrets");
  }
}

/**
 * Clear all stored secrets (USE WITH CAUTION)
 */
export function clearAllSecrets(): void {
  localStorage.removeItem(STORAGE_KEY);
  consola.warn("[pedersenStorage] All secrets cleared");
}

/**
 * Get list of all counter IDs with stored secrets
 */
export function getAllCounterIds(): string[] {
  const storage = getStorage();
  return Object.keys(storage);
}
