/**
 * Counter パッケージの統合フック
 * - owned_counter: 個人所有のカウンター
 * - shared_counter: 共有カウンター
 *
 * React hooks rulesに準拠した設計
 */

import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { type SuiObjectChange } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import consola from "consola";
import * as ownedCounter from "@/generated/counter/owned_counter";
import * as sharedCounter from "@/generated/counter/shared_counter";
import { useNetworkVariable } from "@/networkConfig";

// Type guard for OwnedCounter
function isOwnedCounterType(data: unknown): data is { id: { id: string }; value: string | bigint } {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return (
    "id" in obj &&
    "value" in obj &&
    (typeof obj.value === "bigint" || typeof obj.value === "string")
  );
}

// ================== Counter Value Query Hook ==================
export function useCounterValue(counterId?: string) {
  const suiClient = useSuiClient();

  return useQuery({
    queryKey: ["counter", counterId],
    queryFn: async () => {
      if (!counterId) return null;
      const obj = await suiClient.getObject({
        id: counterId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
        return null;
      }

      if (!isOwnedCounterType(obj.data.content.fields)) {
        return null;
      }

      const fields = obj.data.content.fields;
      return {
        id: counterId,
        value: String(fields.value),
        type: "counter",
      } satisfies {
        id: string;
        value: string;
        type: "counter";
      };
    },
    enabled: !!counterId,
  });
}

// ================== Main Counter Hook ==================
import { toast } from "sonner";

const buildExplorerLink = (digest: string): string =>
  `https://testnet.suivision.xyz/txblock/${digest}`;

const showTxSuccessToast = (message: string, digest: string) => {
  toast.success(message, {
    description: (
      <a
        href={buildExplorerLink(digest)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 underline"
      >
        View transaction on SuiVision
      </a>
    ),
  });
};

export function useCounter() {
  const suiClient = useSuiClient();
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
  const queryClient = useQueryClient();
  const account = useCurrentAccount();
  const counterPackageId = useNetworkVariable("counterPackageId");

  // ================== Owned Counter Operations ==================
  const createOwnedCounter = useMutation({
    mutationKey: ["counter", "owned", "create"],
    mutationFn: async (): Promise<string> => {
      if (!account?.address) {
        throw new Error("No account connected");
      }

      const tx = new Transaction();
      const counter = ownedCounter._new({ package: counterPackageId })(tx);
      tx.transferObjects([counter], account.address);

      const result = await executeTransaction({ transaction: tx });
      const created = result.objectChanges?.find((c: SuiObjectChange) => c.type === "created");

      if (!created || created.type !== "created") {
        throw new Error("Failed to create owned counter");
      }

      showTxSuccessToast("Owned counter created successfully!", result.digest);
      await queryClient.invalidateQueries({ queryKey: ["owned-counters"] });

      return created.objectId;
    },
    onError: (error) => {
      toast.error("Failed to create owned counter", {
        description: error.message,
      });
    },
  });

  const incrementOwnedCounter = useMutation({
    mutationKey: ["counter", "owned", "increment"],
    mutationFn: async (counterId: string): Promise<void> => {
      const totalStart = performance.now();

      // Step 1: Build transaction
      const buildStart = performance.now();
      const tx = new Transaction();
      ownedCounter.increment({
        package: counterPackageId,
        arguments: [tx.object(counterId)],
      })(tx);
      const buildTime = performance.now() - buildStart;

      // Step 2: Sign & Execute (includes user approval wait)
      const executeStart = performance.now();
      const result = await executeTransaction({ transaction: tx });
      const executeTime = performance.now() - executeStart;

      // Step 3: Invalidate queries
      const invalidateStart = performance.now();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["counter", counterId] }),
        queryClient.invalidateQueries({ queryKey: ["owned-counters"] }),
      ]);
      const invalidateTime = performance.now() - invalidateStart;

      const totalTime = performance.now() - totalStart;
      const systemTime = buildTime + invalidateTime; // Sign&Executeはユーザー操作含むので除外

      consola.box(
        `┌─ Normal Transaction ─────────────────────────┐
│                                              │
│  1. Build:              ${buildTime.toFixed(0).padStart(5)}ms            │
│  2. Sign+Execute:       ${executeTime.toFixed(0).padStart(5)}ms  ⏱️ user  │
│  3. Invalidate:         ${invalidateTime.toFixed(0).padStart(5)}ms            │
│                                              │
├──────────────────────────────────────────────┤
│  Total (wall clock):    ${totalTime.toFixed(0).padStart(5)}ms            │
│  System time only:      ${systemTime.toFixed(0).padStart(5)}ms            │
│  (excludes user approval wait)               │
└──────────────────────────────────────────────┘`,
      );

      showTxSuccessToast("Counter incremented successfully!", result.digest);
    },
    onError: (error) => {
      consola.error(`[Normal] Error: ${error.message}`);
      toast.error("Failed to increment counter", {
        description: error.message,
      });
    },
  });

  const setOwnedCounterValue = useMutation({
    mutationKey: ["counter", "owned", "setValue"],
    mutationFn: async (params: { counterId: string; value: bigint }): Promise<void> => {
      const tx = new Transaction();
      ownedCounter.setValue({
        package: counterPackageId,
        arguments: [tx.object(params.counterId), params.value],
      })(tx);

      const result = await executeTransaction({ transaction: tx });

      showTxSuccessToast(`Counter set to ${params.value}!`, result.digest);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["counter", params.counterId] }),
        queryClient.invalidateQueries({ queryKey: ["owned-counters"] }),
      ]);
    },
    onError: (error) => {
      toast.error("Failed to set counter value", {
        description: error.message,
      });
    },
  });

  // ================== Shared Counter Operations ==================
  const createSharedCounter = useMutation({
    mutationKey: ["counter", "shared", "create"],
    mutationFn: async (): Promise<string> => {
      const tx = new Transaction();
      sharedCounter.share({ package: counterPackageId })(tx);

      const result = await executeTransaction({ transaction: tx });
      const created = result.objectChanges?.find((c: SuiObjectChange) => c.type === "created");

      if (!created || created.type !== "created") {
        throw new Error("Failed to create shared counter");
      }

      showTxSuccessToast("Shared counter created successfully!", result.digest);
      await queryClient.invalidateQueries({ queryKey: ["shared-counters"] });

      return created.objectId;
    },
    onError: (error) => {
      toast.error("Failed to create shared counter", {
        description: error.message,
      });
    },
  });

  const incrementSharedCounter = useMutation({
    mutationKey: ["counter", "shared", "increment"],
    mutationFn: async (counterId: string): Promise<void> => {
      const totalStart = performance.now();

      // Step 1: Build transaction
      const buildStart = performance.now();
      const tx = new Transaction();
      sharedCounter.increment({
        package: counterPackageId,
        arguments: [tx.object(counterId)],
      })(tx);
      const buildTime = performance.now() - buildStart;

      // Step 2: Sign & Execute (includes user approval wait)
      const executeStart = performance.now();
      const result = await executeTransaction({ transaction: tx });
      const executeTime = performance.now() - executeStart;

      // Step 3: Invalidate queries
      const invalidateStart = performance.now();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["counter", counterId] }),
        queryClient.invalidateQueries({ queryKey: ["shared-counters"] }),
      ]);
      const invalidateTime = performance.now() - invalidateStart;

      const totalTime = performance.now() - totalStart;
      const systemTime = buildTime + invalidateTime; // Sign&Executeはユーザー操作含むので除外

      consola.box(
        `┌─ Normal Transaction (Shared) ────────────────┐
│                                              │
│  1. Build:              ${buildTime.toFixed(0).padStart(5)}ms            │
│  2. Sign+Execute:       ${executeTime.toFixed(0).padStart(5)}ms  ⏱️ user  │
│  3. Invalidate:         ${invalidateTime.toFixed(0).padStart(5)}ms            │
│                                              │
├──────────────────────────────────────────────┤
│  Total (wall clock):    ${totalTime.toFixed(0).padStart(5)}ms            │
│  System time only:      ${systemTime.toFixed(0).padStart(5)}ms            │
│  (excludes user approval wait)               │
└──────────────────────────────────────────────┘`,
      );

      showTxSuccessToast("Shared counter incremented successfully!", result.digest);
    },
    onError: (error) => {
      consola.error(`[Normal Shared] Error: ${error.message}`);
      toast.error("Failed to increment shared counter", {
        description: error.message,
      });
    },
  });

  const setSharedCounterValue = useMutation({
    mutationKey: ["counter", "shared", "setValue"],
    mutationFn: async (params: { counterId: string; value: bigint }): Promise<void> => {
      const tx = new Transaction();
      sharedCounter.setValue({
        package: counterPackageId,
        arguments: [tx.object(params.counterId), params.value],
      })(tx);

      const result = await executeTransaction({ transaction: tx });

      showTxSuccessToast(`Shared counter set to ${params.value}!`, result.digest);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["counter", params.counterId] }),
        queryClient.invalidateQueries({ queryKey: ["shared-counters"] }),
      ]);
    },
    onError: (error) => {
      toast.error("Failed to set shared counter value", {
        description: error.message,
      });
    },
  });

  // ================== Custom Transaction ==================
  const executeCustomTransaction = useMutation({
    mutationKey: ["counter", "custom"],
    mutationFn: async (tx: Transaction) => {
      return executeTransaction({ transaction: tx });
    },
  });

  // ================== Unified API ==================
  return {
    owned: {
      create: createOwnedCounter.mutateAsync,
      increment: incrementOwnedCounter.mutateAsync,
      setValue: setOwnedCounterValue.mutateAsync,
      useValue: useCounterValue,
      isPending: {
        create: createOwnedCounter.isPending,
        increment: incrementOwnedCounter.isPending,
        setValue: setOwnedCounterValue.isPending,
      },
    },
    shared: {
      create: createSharedCounter.mutateAsync,
      increment: incrementSharedCounter.mutateAsync,
      setValue: setSharedCounterValue.mutateAsync,
      useValue: useCounterValue,
      isPending: {
        create: createSharedCounter.isPending,
        increment: incrementSharedCounter.isPending,
        setValue: setSharedCounterValue.isPending,
      },
    },

    // 汎用的なトランザクション構築ヘルパー
    buildTx: (
      builder: (
        tx: Transaction,
        pkg: { owned: typeof ownedCounter; shared: typeof sharedCounter; packageId: string },
      ) => void,
    ) => {
      const tx = new Transaction();
      builder(tx, { owned: ownedCounter, shared: sharedCounter, packageId: counterPackageId });
      return tx;
    },

    // Execute custom transaction
    useCustomTransaction: () => executeCustomTransaction,
  };
}

// Type exports for better TypeScript experience
export type CounterHookResult = ReturnType<typeof useCounter>;
export type OwnedCounterOperations = CounterHookResult["owned"];
export type SharedCounterOperations = CounterHookResult["shared"];
