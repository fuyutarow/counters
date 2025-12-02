/**
 * Counter contracts unified hook
 * - owned_counter: Personal owned counter
 * - shared_counter: Shared public counter
 *
 * React hooks rules compliant design
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fromPromise, type Result } from "neverthrow";
import { toast } from "sonner";
import { parseEventLogs } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { ownedCounterRegistryAbi, sharedCounterRegistryAbi } from "@/generated";

const OWNED_COUNTER_REGISTRY_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const SHARED_COUNTER_REGISTRY_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" as const;

// ================== Explorer Link Builder ==================
const buildExplorerLink = (hash: string): string => {
  // For Anvil (local development)
  if (window.location.hostname === "localhost") {
    return `https://anvil.local/tx/${hash}`;
  }

  // For Sepolia testnet
  return `https://sepolia.etherscan.io/tx/${hash}`;
};

const showTxSuccessToast = (message: string, hash: string) => {
  toast.success(message, {
    description: (
      <a
        href={buildExplorerLink(hash)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 underline"
      >
        View transaction on Etherscan
      </a>
    ),
  });
};

// ================== Counter Value Query Hooks ==================
export function useOwnedCounterValue(id?: bigint) {
  return useReadContract({
    address: OWNED_COUNTER_REGISTRY_ADDRESS,
    abi: ownedCounterRegistryAbi,
    functionName: "valueOf",
    args: id ? [id] : undefined,
    query: { enabled: !!id },
  });
}

export function useOwnedCounterOwner(id?: bigint) {
  return useReadContract({
    address: OWNED_COUNTER_REGISTRY_ADDRESS,
    abi: ownedCounterRegistryAbi,
    functionName: "ownerOf",
    args: id ? [id] : undefined,
    query: { enabled: !!id },
  });
}

export function useSharedCounterValue(id?: bigint) {
  return useReadContract({
    address: SHARED_COUNTER_REGISTRY_ADDRESS,
    abi: sharedCounterRegistryAbi,
    functionName: "valueOf",
    args: id ? [id] : undefined,
    query: { enabled: !!id },
  });
}

// ================== Counter List Query Hooks ==================
export function useOwnedCounterList() {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ["owned-counters", address],
    queryFn: async (): Promise<Array<{ id: bigint }>> => {
      if (!address || !publicClient) return [];

      const nextIdResult = await fromPromise(
        publicClient.readContract({
          address: OWNED_COUNTER_REGISTRY_ADDRESS,
          abi: ownedCounterRegistryAbi,
          functionName: "nextId",
        }),
        (e) => (e instanceof Error ? e : new Error("Failed to get nextId")),
      );

      if (nextIdResult.isErr()) return [];

      const nextId = nextIdResult.value as bigint;
      if (nextId === 0n) return [];

      // 2. 各IDのオーナーをチェック
      const ownedCounters: Array<{ id: bigint }> = [];

      for (let id = 1n; id <= nextId; id++) {
        const ownerResult = await fromPromise(
          publicClient.readContract({
            address: OWNED_COUNTER_REGISTRY_ADDRESS,
            abi: ownedCounterRegistryAbi,
            functionName: "ownerOf",
            args: [id],
          }),
          (e) => (e instanceof Error ? e : new Error("Failed to get owner")),
        );

        if (ownerResult.isOk()) {
          const owner = ownerResult.value as `0x${string}`;
          if (owner.toLowerCase() === address.toLowerCase()) {
            ownedCounters.push({ id });
          }
        }
      }

      return ownedCounters;
    },
    enabled: !!address && !!publicClient,
  });
}

export function useSharedCounterList() {
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ["shared-counters"],
    queryFn: async (): Promise<Array<{ id: bigint }>> => {
      if (!publicClient) return [];

      const nextIdResult = await fromPromise(
        publicClient.readContract({
          address: SHARED_COUNTER_REGISTRY_ADDRESS,
          abi: sharedCounterRegistryAbi,
          functionName: "nextId",
        }),
        (e) => (e instanceof Error ? e : new Error("Failed to get nextId")),
      );

      if (nextIdResult.isErr()) return [];

      const nextId = nextIdResult.value as bigint;
      if (nextId === 0n) return [];

      // 2. 全IDを収集（shared counterは全員がアクセス可能）
      const sharedCounters: Array<{ id: bigint }> = [];

      for (let id = 1n; id <= nextId; id++) {
        sharedCounters.push({ id });
      }

      return sharedCounters;
    },
    enabled: !!publicClient,
  });
}

// ================== Main Counter Hook ==================
export function useCounter() {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  // Sui風のトランザクション実行ヘルパー
  const executeTransaction = async (config: Parameters<typeof writeContractAsync>[0]) => {
    const hash = await writeContractAsync(config);
    return { digest: hash };
  };

  // トランザクションレシートからイベントを解析してIDを取得
  const executeTransactionWithReceipt = async (
    config: Parameters<typeof writeContractAsync>[0],
    eventName: string,
  ) => {
    if (!publicClient) {
      throw new Error("Public client not available");
    }

    const hash = await writeContractAsync(config);

    // wagmiのhookでトランザクションレシートを待機
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // イベントログからIDを抽出
    const logs = parseEventLogs({
      abi: config.abi,
      logs: receipt.logs,
      eventName,
    });

    if (logs.length === 0) {
      throw new Error(`No ${eventName} event found in transaction`);
    }

    // ログの最初のエントリからIDを取得
    const log = logs[0];
    if (
      !log ||
      !("args" in log) ||
      typeof log.args !== "object" ||
      !log.args ||
      !("id" in log.args)
    ) {
      throw new Error(`Failed to extract counter ID from ${eventName} event`);
    }
    const counterId = (log.args as { id: bigint }).id;

    if (!counterId) {
      throw new Error(`Failed to extract counter ID from ${eventName} event`);
    }

    return { digest: hash, counterId };
  };

  // ================== Owned Counter Operations ==================
  const mintOwnedCounter = useMutation({
    mutationKey: ["counter", "owned", "mint"],
    mutationFn: async (): Promise<{ hash: string; counterId: bigint }> => {
      return new Promise((resolve, reject) => {
        if (!address) {
          reject(new Error("No account connected"));
          return;
        }

        executeTransactionWithReceipt(
          {
            address: OWNED_COUNTER_REGISTRY_ADDRESS,
            abi: ownedCounterRegistryAbi,
            functionName: "mint",
          },
          "Minted",
        )
          .then((result) => {
            showTxSuccessToast("Counter minted successfully!", result.digest);
            queryClient.invalidateQueries({ queryKey: ["owned-counters"] });
            resolve({ hash: result.digest, counterId: result.counterId });
          })
          .catch(reject);
      });
    },
    onError: (error) => {
      toast.error("Failed to mint counter", {
        description: error.message,
      });
    },
  });

  const incrementOwnedCounter = useMutation({
    mutationKey: ["counter", "owned", "increment"],
    mutationFn: async (id: bigint): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!address) {
          reject(new Error("No account connected"));
          return;
        }

        executeTransaction({
          address: OWNED_COUNTER_REGISTRY_ADDRESS,
          abi: ownedCounterRegistryAbi,
          functionName: "increment",
          args: [id],
        })
          .then((result) => {
            showTxSuccessToast("Counter incremented successfully!", result.digest);
            queryClient.invalidateQueries({ queryKey: ["counter", id] });
            queryClient.invalidateQueries({ queryKey: ["owned-counters"] });
            resolve();
          })
          .catch(reject);
      });
    },
    onError: (error) => {
      toast.error("Failed to increment counter", {
        description: error.message,
      });
    },
  });

  const setOwnedCounterValue = useMutation({
    mutationKey: ["counter", "owned", "setValue"],
    mutationFn: async (params: { id: bigint; value: bigint }): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!address) {
          reject(new Error("No account connected"));
          return;
        }

        executeTransaction({
          address: OWNED_COUNTER_REGISTRY_ADDRESS,
          abi: ownedCounterRegistryAbi,
          functionName: "setValue",
          args: [params.id, params.value],
        })
          .then((result) => {
            showTxSuccessToast(`Counter set to ${params.value}!`, result.digest);
            queryClient.invalidateQueries({ queryKey: ["counter", params.id] });
            queryClient.invalidateQueries({ queryKey: ["owned-counters"] });
            resolve();
          })
          .catch(reject);
      });
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
    mutationFn: async (): Promise<{ hash: string; counterId: bigint }> => {
      return new Promise((resolve, reject) => {
        if (!address) {
          reject(new Error("No account connected"));
          return;
        }

        executeTransactionWithReceipt(
          {
            address: SHARED_COUNTER_REGISTRY_ADDRESS,
            abi: sharedCounterRegistryAbi,
            functionName: "create",
          },
          "Created",
        )
          .then((result) => {
            showTxSuccessToast("Shared counter created successfully!", result.digest);
            queryClient.invalidateQueries({ queryKey: ["shared-counters"] });
            resolve({ hash: result.digest, counterId: result.counterId });
          })
          .catch(reject);
      });
    },
    onError: (error) => {
      toast.error("Failed to create shared counter", {
        description: error.message,
      });
    },
  });

  const incrementSharedCounter = useMutation({
    mutationKey: ["counter", "shared", "increment"],
    mutationFn: async (id: bigint): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!address) {
          reject(new Error("No account connected"));
          return;
        }

        executeTransaction({
          address: SHARED_COUNTER_REGISTRY_ADDRESS,
          abi: sharedCounterRegistryAbi,
          functionName: "increment",
          args: [id],
        })
          .then((result) => {
            showTxSuccessToast("Shared counter incremented successfully!", result.digest);
            queryClient.invalidateQueries({ queryKey: ["counter", id] });
            queryClient.invalidateQueries({ queryKey: ["shared-counters"] });
            resolve();
          })
          .catch(reject);
      });
    },
    onError: (error) => {
      toast.error("Failed to increment shared counter", {
        description: error.message,
      });
    },
  });

  const setSharedCounterValue = useMutation({
    mutationKey: ["counter", "shared", "setValue"],
    mutationFn: async (params: { id: bigint; value: bigint }): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!address) {
          reject(new Error("No account connected"));
          return;
        }

        executeTransaction({
          address: SHARED_COUNTER_REGISTRY_ADDRESS,
          abi: sharedCounterRegistryAbi,
          functionName: "setValue",
          args: [params.id, params.value],
        })
          .then((result) => {
            showTxSuccessToast(`Shared counter set to ${params.value}!`, result.digest);
            queryClient.invalidateQueries({ queryKey: ["counter", params.id] });
            queryClient.invalidateQueries({ queryKey: ["shared-counters"] });
            resolve();
          })
          .catch(reject);
      });
    },
    onError: (error) => {
      toast.error("Failed to set shared counter value", {
        description: error.message,
      });
    },
  });

  // ================== Result-wrapped API ==================
  const wrapMutation = <T, A extends unknown[]>(
    mutateAsync: (...args: A) => Promise<T>,
  ): ((...args: A) => Promise<Result<T, Error>>) => {
    return async (...args: A): Promise<Result<T, Error>> => {
      const result = await fromPromise(mutateAsync(...args), (e) =>
        e instanceof Error ? e : new Error("Unknown error"),
      );
      return result;
    };
  };

  // ================== Unified API ==================
  return {
    owned: {
      useValue: useOwnedCounterValue,
      useOwner: useOwnedCounterOwner,
      mint: wrapMutation(mintOwnedCounter.mutateAsync),
      increment: wrapMutation(incrementOwnedCounter.mutateAsync),
      setValue: wrapMutation(setOwnedCounterValue.mutateAsync),
      isPending: {
        mint: mintOwnedCounter.isPending,
        increment: incrementOwnedCounter.isPending,
        setValue: setOwnedCounterValue.isPending,
      },
    },
    shared: {
      useValue: useSharedCounterValue,
      create: wrapMutation(createSharedCounter.mutateAsync),
      increment: wrapMutation(incrementSharedCounter.mutateAsync),
      setValue: wrapMutation(setSharedCounterValue.mutateAsync),
      isPending: {
        create: createSharedCounter.isPending,
        increment: incrementSharedCounter.isPending,
        setValue: setSharedCounterValue.isPending,
      },
    },
  };
}

// Type exports for better TypeScript experience
export type CounterHookResult = ReturnType<typeof useCounter>;
export type OwnedCounterOperations = CounterHookResult["owned"];
export type SharedCounterOperations = CounterHookResult["shared"];
