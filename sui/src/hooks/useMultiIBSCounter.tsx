/**
 * Multi-IBS Counter パッケージの統合フック
 * - multi_ibs_counter: 閾値署名によるカウンター
 * - SealMultiIBSAggregator: Key Server統合
 *
 * React hooks rulesに準拠した設計
 */

import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { type SuiObjectChange } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { counterPackage, type Multi_ibs_counterMultiIBSCounterType } from "@/abi";

// Real Key Server configurations from testnet
const KEY_SERVERS = [
  {
    name: "Studio Mirai",
    objectId: "0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2",
  },
  {
    name: "Ruby Node",
    objectId: "0x6068c0acb197dddbacd4746a9de7f025b2ed5a5b6c1b1ab44dade4426d141da2",
  },
  {
    name: "NodeInfra",
    objectId: "0x5466b7df5c15b508678d51496ada8afab0d6f70a01c10613123382b1b8131007",
  },
];

const THRESHOLD = 2; // 2-of-3 threshold

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

// ================== Multi-IBS Counter Value Query Hook ==================
export function useMultiIBSCounterValue(counterId?: string) {
  const suiClient = useSuiClient();

  return useQuery({
    queryKey: ["multi-ibs-counter", counterId],
    queryFn: async () => {
      if (!counterId) return null;
      const obj = await suiClient.getObject({
        id: counterId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
        return null;
      }

      // Type check for Multi-IBS Counter
      if (!obj.data.content.type.includes("MultiIBSCounter")) {
        return null;
      }

      const fields = obj.data.content.fields as unknown as Multi_ibs_counterMultiIBSCounterType;
      return {
        id: counterId,
        value: fields.value,
        config: fields.config,
        type: "multi-ibs-counter",
      } satisfies {
        id: string;
        value: string;
        config: unknown;
        type: "multi-ibs-counter";
      };
    },
    enabled: !!counterId,
  });
}

// ================== Main Multi-IBS Counter Hook ==================
export function useMultiIBSCounter() {
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

  // ================== Multi-IBS Counter Operations ==================
  const createMultiIBSCounter = useMutation({
    mutationKey: ["multi-ibs-counter", "create"],
    mutationFn: async (): Promise<string> => {
      if (!account?.address) {
        throw new Error("No account connected");
      }

      // Import Seal integration from lib
      const { createSealShardCounterConfig } = await import("@/lib/seal-aggregator");

      const tx = new Transaction();
      const keyServerIds = KEY_SERVERS.map((server) => server.objectId);

      // Fetch real public keys from Seal Key Servers
      const counterConfig = await createSealShardCounterConfig(keyServerIds, THRESHOLD, "testnet");

      counterPackage.multi_ibs_counter.share(tx, {
        arguments: [
          tx.pure.vector("id", counterConfig.keyServerIds),
          tx.pure.vector("vector<u8>", counterConfig.publicKeys),
          tx.pure.u64(THRESHOLD),
        ],
      });

      const result = await executeTransaction({ transaction: tx });

      // Wait for transaction to be processed
      await suiClient.waitForTransaction({ digest: result.digest });

      const created = result.objectChanges?.find(
        (c: SuiObjectChange) =>
          c.type === "created" && c.type === "created" && c.objectType?.includes("MultiIBSCounter"),
      );

      if (!created || created.type !== "created") {
        throw new Error("Failed to create Multi-IBS counter");
      }

      showTxSuccessToast("Multi-IBS counter created successfully!", result.digest);
      await queryClient.invalidateQueries({ queryKey: ["multi-ibs-counters"] });

      return created.objectId;
    },
    onError: (error) => {
      toast.error("Failed to create Multi-IBS counter", {
        description: error.message,
      });
    },
  });

  // Multi-IBS signature and increment operation
  const signAndIncrementCounter = useMutation({
    mutationKey: ["multi-ibs-counter", "signAndIncrement"],
    mutationFn: async (params: { counterId: string; message: string }): Promise<void> => {
      if (!account?.address) {
        throw new Error("No account connected");
      }

      // Import Seal aggregator
      const { SealMultiIBSAggregator } = await import("@/lib/seal-aggregator");
      const sealAggregator = new SealMultiIBSAggregator();

      // For testing: Use test keypair. In production, use wallet signing
      const { getNamedTestKeypair } = await import("@/lib/test-keypair");
      const keypair = getNamedTestKeypair("PRIME");

      // Step 1: Fetch IBE key shares from real Key Servers
      const keyShares = await sealAggregator.fetchSecretKeyShares(
        params.counterId,
        keypair,
        params.message,
        THRESHOLD,
      );

      if (keyShares.length !== THRESHOLD) {
        throw new Error(`Expected ${THRESHOLD} key shares, got ${keyShares.length}`);
      }

      // Step 2: Aggregate IBE keys
      const aggregatedIBESignature = sealAggregator.aggregateSecretKeys(keyShares);

      // Step 3: Create Multi-IBS signature
      const signature = sealAggregator.createMultiIBSSignature(
        aggregatedIBESignature,
        params.message,
        keypair.getPublicKey().toSuiAddress(),
      );

      const keyServerIds = keyShares.map((share) => share.serverId);

      // Step 4: Create on-chain transaction
      const tx = new Transaction();
      const messageBytes = new TextEncoder().encode(params.message);

      // Create AggregatedPublicKey
      const aggregatedKey = counterPackage.multi_ibs_counter.new_aggregated_public_key(tx, {
        arguments: [tx.object(params.counterId)],
      });

      // Add Key Server public keys
      for (const keyServerId of keyServerIds) {
        counterPackage.multi_ibs_counter.aggregate_seal_shard_pubkey(tx, {
          arguments: [tx.object(params.counterId), aggregatedKey, tx.pure.id(keyServerId)],
        });
      }

      // Verify signature and create proof
      const proof = counterPackage.multi_ibs_counter.verify_and_create_proof(tx, {
        arguments: [
          tx.object(params.counterId),
          aggregatedKey,
          tx.pure.vector("u8", Array.from(signature.signature)),
          tx.pure.vector("u8", Array.from(messageBytes)),
        ],
      });

      // Increment counter with proof
      counterPackage.multi_ibs_counter.increment(tx, {
        arguments: [tx.object(params.counterId), proof],
      });

      // Clean up AggregatedPublicKey
      counterPackage.multi_ibs_counter.destroy_aggregated_public_key(tx, {
        arguments: [aggregatedKey],
      });

      // Set manual gas budget
      tx.setGasBudget(10000000); // 10M MIST

      const result = await executeTransaction({ transaction: tx });

      showTxSuccessToast("Counter incremented with Multi-IBS signature!", result.digest);
      await queryClient.invalidateQueries({ queryKey: ["multi-ibs-counter", params.counterId] });
    },
    onError: (error) => {
      toast.error("Failed to sign and increment counter", {
        description: error.message,
      });
    },
  });

  // ================== Unified API ==================
  return {
    // Counter operations
    create: createMultiIBSCounter.mutateAsync,
    signAndIncrement: signAndIncrementCounter.mutateAsync,
    useValue: useMultiIBSCounterValue,

    // Loading states
    isPending: {
      create: createMultiIBSCounter.isPending,
      signAndIncrement: signAndIncrementCounter.isPending,
    },

    // Key Server configuration
    keyServers: KEY_SERVERS,
    threshold: THRESHOLD,

    // Transaction builder helper
    buildTx: (builder: (tx: Transaction, pkg: typeof counterPackage) => void) => {
      const tx = new Transaction();
      builder(tx, counterPackage);
      return tx;
    },
  };
}

// Type exports for better TypeScript experience
export type MultiIBSCounterHookResult = ReturnType<typeof useMultiIBSCounter>;
