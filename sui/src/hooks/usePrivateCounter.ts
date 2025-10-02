"use client";

import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { type SuiObjectChange } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildPoseidon } from "circomlibjs";
import { increment, _new as newPrivateCounter } from "@/generated/counter/private_counter";
import { type PrivateCounterState } from "@/lib/zkProof";
import { getVerifyingKeyBytes } from "@/utils/verifyingKey";
import { useZkProver } from "./useZkProver";

const PACKAGE_ID = "0x4698f2a2b8277f3e6779b1d0db415e66c9d68545d7b82dccab54a8de10ec74d3";
const STORAGE_KEY = "privateCounters";

interface StoredCounterData {
  salt: string;
  value: string;
  randomness: string;
  valueHash: string;
  saltHash: string;
}

// Generate random field element (< BN254 scalar field order)
function generateRandomFieldElement(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // BN254 scalar field order (simplified, actual: 21888242871839275222246405745257275088548364400416034343698204186575808495617)
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

export function usePrivateCounter() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const queryClient = useQueryClient();
  const { mutateAsync: executeTransaction } = useSignAndExecuteTransaction({
    execute: async ({ bytes, signature }) => {
      const executionResult = await suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: {
          showRawEffects: true,
          showObjectChanges: true,
        },
        requestType: "WaitForLocalExecution",
      });

      return suiClient.waitForTransaction({
        digest: executionResult.digest,
        options: {
          showRawEffects: true,
          showObjectChanges: true,
        },
      });
    },
  });
  const { mutateAsync: generateProof } = useZkProver();

  // Get stored counter data from localStorage
  const getStoredCounterData = (counterId: string): StoredCounterData | null => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const data = JSON.parse(stored);
      return data[counterId] || null;
    } catch {
      return null;
    }
  };

  // Store counter data to localStorage
  const storeCounterData = (counterId: string, data: StoredCounterData) => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const allData = stored ? JSON.parse(stored) : {};
      allData[counterId] = data;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
    } catch (_error) {}
  };

  // Get all stored counter IDs
  const getStoredCounterIds = (): string[] => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      const data = JSON.parse(stored);
      return Object.keys(data);
    } catch {
      return [];
    }
  };

  // Create new private counter
  const createCounter = useMutation({
    mutationFn: async () => {
      if (!account?.address) throw new Error("Wallet not connected");

      // Generate initial secrets
      const salt = generateRandomFieldElement();
      const initialRandomness = generateRandomFieldElement();
      const initialValue = BigInt(0);

      // Compute initial value digest using Poseidon
      const poseidon = await buildPoseidon();
      const initialValueDigest = poseidon([initialValue, initialRandomness]);
      const initialValueDigestBigInt = BigInt(poseidon.F.toString(initialValueDigest));

      // Compute salt digest using Poseidon
      const saltDigest = poseidon([salt]);
      const saltDigestBigInt = BigInt(poseidon.F.toString(saltDigest));

      // Load verifying key bytes
      const vkBytes = await getVerifyingKeyBytes();

      // Create transaction
      const tx = new Transaction();
      newPrivateCounter({
        package: PACKAGE_ID,
        arguments: {
          initialValueDigest: initialValueDigestBigInt,
          saltValue: salt,
          verifyingKeyBytes: Array.from(vkBytes),
        },
      })(tx);

      // Execute transaction
      const result = await executeTransaction({
        transaction: tx,
      });

      // Extract created object ID from object changes
      const created = result.objectChanges?.find((c: SuiObjectChange) => c.type === "created");

      if (!created || created.type !== "created") {
        throw new Error("Failed to create counter");
      }

      const counterId = created.objectId;

      // Store secrets
      storeCounterData(counterId, {
        salt: salt.toString(),
        value: initialValue.toString(),
        randomness: initialRandomness.toString(),
        valueHash: initialValueDigestBigInt.toString(),
        saltHash: saltDigestBigInt.toString(),
      });

      return { counterId, digest: result.digest };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["privateCounters"] });
    },
  });

  // Increment counter with ZK proof
  const incrementCounter = useMutation({
    mutationFn: async (counterId: string) => {
      if (!account?.address) throw new Error("Wallet not connected");

      // Get stored secrets
      const stored = getStoredCounterData(counterId);
      if (!stored) throw new Error("Counter secrets not found");

      const salt = BigInt(stored.salt);
      const oldValue = BigInt(stored.value);
      const oldRandomness = BigInt(stored.randomness);
      const oldHash = BigInt(stored.valueHash);
      const saltHash = BigInt(stored.saltHash);

      // Generate new randomness for next state
      const newRandomness = generateRandomFieldElement();

      // Generate proof
      const proofResult = await generateProof({
        salt,
        oldValue,
        oldRandomness,
        newRandomness,
        oldHash,
        saltHash,
      });

      // Load verifying key bytes
      const vkBytes = await getVerifyingKeyBytes();

      // Create transaction
      const tx = new Transaction();
      increment({
        package: PACKAGE_ID,
        arguments: {
          self: counterId,
          proofBytes: Array.from(proofResult.proofBytes),
          publicInputsBytes: Array.from(proofResult.publicInputsBytes),
          verifyingKeyBytes: Array.from(vkBytes),
        },
      })(tx);

      // Execute transaction
      const result = await executeTransaction({
        transaction: tx,
      });

      // Update stored secrets
      storeCounterData(counterId, {
        ...stored,
        value: proofResult.newValue.toString(),
        randomness: newRandomness.toString(),
        valueHash: proofResult.newHash.toString(),
      });

      return { digest: result.digest };
    },
    onSuccess: (_, counterId) => {
      queryClient.invalidateQueries({ queryKey: ["privateCounter", counterId] });
    },
  });

  // Get counter value from chain
  const usePrivateCounterValue = (counterId?: string) => {
    return useQuery({
      queryKey: ["privateCounter", counterId],
      queryFn: async () => {
        if (!counterId) return null;

        const obj = await suiClient.getObject({
          id: counterId,
          options: { showContent: true },
        });

        if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
          return null;
        }

        const fields = obj.data.content.fields as {
          value_digest: string;
          salt_digest: string;
          vk_digest: string;
        };

        return {
          id: counterId,
          valueHash: fields.value_digest,
          saltHash: fields.salt_digest,
          verifyingKeyHash: fields.vk_digest,
        };
      },
      enabled: !!counterId,
    });
  };

  // Get local counter state
  const getLocalCounterState = (counterId: string): PrivateCounterState | null => {
    const stored = getStoredCounterData(counterId);
    if (!stored) return null;

    return {
      value: BigInt(stored.value),
      randomness: BigInt(stored.randomness),
      valueHash: BigInt(stored.valueHash),
      salt: BigInt(stored.salt),
      saltHash: BigInt(stored.saltHash),
    };
  };

  return {
    create: createCounter.mutateAsync,
    increment: incrementCounter.mutateAsync,
    isCreating: createCounter.isPending,
    isIncrementing: incrementCounter.isPending,
    usePrivateCounterValue,
    getLocalCounterState,
    getStoredCounterIds,
  };
}
