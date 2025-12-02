"use client";

import * as anchor from "@coral-xyz/anchor";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import consola from "consola";
import { toast } from "sonner";
import { useProgram } from "./useProgram";

const _buildExplorerLink = (signature: string): string =>
  `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

const showTxSuccessToast = (message: string, signature: string) => {
  toast.success(message, {
    description: `View transaction: ${_buildExplorerLink(signature)}`,
  });
};

// ================== Counter Value Query Hook ==================
export function useCounterValue(counterId?: string, type: "owned" | "shared" = "owned") {
  const { ownedCounterProgram, sharedCounterProgram } = useProgram();

  return useQuery({
    queryKey: ["counter", type, counterId],
    queryFn: async () => {
      if (!counterId) return null;

      if (type === "owned" && ownedCounterProgram) {
        const counterPubkey = new anchor.web3.PublicKey(counterId);
        const account = await ownedCounterProgram.account.ownedCounter
          .fetch(counterPubkey)
          .catch(() => null);
        if (!account) return null;

        return {
          id: counterId,
          value: account.value.toString(),
          owner: account.owner.toString(),
          creator: undefined,
          seed: account.seed.toString(),
          type,
        };
      }
      if (type === "shared" && sharedCounterProgram) {
        const counterPubkey = new anchor.web3.PublicKey(counterId);
        const account = await sharedCounterProgram.account.sharedCounter
          .fetch(counterPubkey)
          .catch(() => null);
        if (!account) return null;

        return {
          id: counterId,
          value: account.value.toString(),
          owner: undefined,
          seed: account.id.toString(),
          type,
        };
      }

      return null;
    },
    enabled: !!counterId && !!(type === "owned" ? ownedCounterProgram : sharedCounterProgram),
  });
}

// ================== Main Counter Hook ==================
export function useCounter() {
  const { ownedCounterProgram, sharedCounterProgram, publicKey } = useProgram();
  const queryClient = useQueryClient();

  // ================== Owned Counter Operations ==================
  const createOwnedCounter = useMutation({
    mutationKey: ["counter", "owned", "create"],
    mutationFn: async (): Promise<string> => {
      if (!ownedCounterProgram || !publicKey) {
        throw new Error("Program or wallet not available");
      }

      // Generate a random seed and counter keypair
      const seed = Math.floor(Math.random() * 1000000);
      const seedBN = new anchor.BN(seed);
      const counterKeypair = anchor.web3.Keypair.generate();

      const signature = await ownedCounterProgram.methods
        .create(seedBN)
        .accountsPartial({
          counter: counterKeypair.publicKey,
          owner: publicKey,
        })
        .signers([counterKeypair])
        .rpc();

      showTxSuccessToast("Owned counter created successfully!", signature);
      await queryClient.invalidateQueries({ queryKey: ["owned-counters"] });

      return counterKeypair.publicKey.toString();
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
      if (!ownedCounterProgram || !publicKey) {
        throw new Error("Program or wallet not available");
      }

      const totalStart = performance.now();

      // Step 1: Get recent blockhash
      const blockhashStart = performance.now();
      const { blockhash, lastValidBlockHeight } =
        await ownedCounterProgram.provider.connection.getLatestBlockhash("confirmed");
      const blockhashTime = performance.now() - blockhashStart;
      consola.info(`[Normal Owned] 1. Get blockhash: ${blockhashTime.toFixed(0)}ms`);

      // Step 2: Build and Sign + Execute (Anchor .rpc() combines these)
      const rpcStart = performance.now();
      const signature = await ownedCounterProgram.methods
        .increment()
        .accountsPartial({
          counter: new anchor.web3.PublicKey(counterId),
          owner: publicKey,
        })
        .rpc();
      const rpcTime = performance.now() - rpcStart;
      consola.info(`[Normal Owned] 2. Sign + Execute (rpc): ${rpcTime.toFixed(0)}ms`);

      // Step 3: Additional confirmation check
      const waitStart = performance.now();
      await ownedCounterProgram.provider.connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed",
      );
      const waitTime = performance.now() - waitStart;
      consola.info(`[Normal Owned] 3. Wait for tx: ${waitTime.toFixed(0)}ms`);

      const totalTime = performance.now() - totalStart;
      const systemTime = blockhashTime + waitTime;

      consola.box(
        `┌─ Normal Transaction (Owned) ─────────────────┐
│                                              │
│  1. Get blockhash:        ${blockhashTime.toFixed(0).padStart(5)}ms            │
│  2. Sign+Execute (rpc):   ${rpcTime.toFixed(0).padStart(5)}ms  ⏱️ user  │
│  3. Wait for tx:          ${waitTime.toFixed(0).padStart(5)}ms            │
│                                              │
├──────────────────────────────────────────────┤
│  Total (wall clock):      ${totalTime.toFixed(0).padStart(5)}ms            │
│  System time only:        ${systemTime.toFixed(0).padStart(5)}ms            │
│  (rpc includes user approval wait)           │
└──────────────────────────────────────────────┘`,
      );

      showTxSuccessToast("Counter incremented successfully!", signature);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["counter", "owned", counterId] }),
        queryClient.invalidateQueries({ queryKey: ["owned-counters"] }),
      ]);
    },
    onError: (error) => {
      consola.error(`[Normal Owned] Error: ${error.message}`);
      toast.error("Failed to increment counter", {
        description: error.message,
      });
    },
  });

  const setOwnedCounterValue = useMutation({
    mutationKey: ["counter", "owned", "setValue"],
    mutationFn: async (params: { counterId: string; value: number }): Promise<void> => {
      if (!ownedCounterProgram || !publicKey) {
        throw new Error("Program or wallet not available");
      }

      const signature = await ownedCounterProgram.methods
        .setValue(new anchor.BN(params.value))
        .accountsPartial({
          counter: new anchor.web3.PublicKey(params.counterId),
          owner: publicKey,
        })
        .rpc();

      showTxSuccessToast(`Counter set to ${params.value}!`, signature);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["counter", "owned", params.counterId] }),
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
      if (!sharedCounterProgram || !publicKey) {
        throw new Error("Program or wallet not available");
      }

      // Generate counter keypair and get registry PDA
      const counterKeypair = anchor.web3.Keypair.generate();
      const [registryPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("shared_registry")],
        sharedCounterProgram.programId,
      );

      const signature = await sharedCounterProgram.methods
        .create()
        .accountsPartial({
          counter: counterKeypair.publicKey,
          creator: publicKey,
          payer: publicKey,
          registry: registryPda,
        })
        .signers([counterKeypair])
        .rpc();

      showTxSuccessToast("Shared counter created successfully!", signature);
      await queryClient.invalidateQueries({ queryKey: ["shared-counters"] });

      return counterKeypair.publicKey.toString();
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
      if (!sharedCounterProgram || !publicKey) {
        throw new Error("Program or wallet not available");
      }

      const totalStart = performance.now();

      // Step 1: Get recent blockhash
      const blockhashStart = performance.now();
      const { blockhash, lastValidBlockHeight } =
        await sharedCounterProgram.provider.connection.getLatestBlockhash("confirmed");
      const blockhashTime = performance.now() - blockhashStart;
      consola.info(`[Normal] 1. Get blockhash: ${blockhashTime.toFixed(0)}ms`);

      // Step 2: Build and Sign + Execute (Anchor .rpc() combines these)
      // Note: Anchor's rpc() includes sign + send + confirm, so we measure it together
      const rpcStart = performance.now();
      const signature = await sharedCounterProgram.methods
        .increment()
        .accountsPartial({
          counter: new anchor.web3.PublicKey(counterId),
          caller: publicKey,
        })
        .rpc();
      const rpcTime = performance.now() - rpcStart;
      consola.info(`[Normal] 2. Sign + Execute (rpc): ${rpcTime.toFixed(0)}ms`);

      // Step 3: Additional confirmation check
      const waitStart = performance.now();
      await sharedCounterProgram.provider.connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed",
      );
      const waitTime = performance.now() - waitStart;
      consola.info(`[Normal] 3. Wait for tx: ${waitTime.toFixed(0)}ms`);

      const totalTime = performance.now() - totalStart;
      // System time excludes user sign wait (which is inside rpc())
      // For fair comparison, we note that rpcTime includes user wait
      const systemTime = blockhashTime + waitTime;

      consola.box(
        `┌─ Normal Transaction (Shared) ────────────────┐
│                                              │
│  1. Get blockhash:        ${blockhashTime.toFixed(0).padStart(5)}ms            │
│  2. Sign+Execute (rpc):   ${rpcTime.toFixed(0).padStart(5)}ms  ⏱️ user  │
│  3. Wait for tx:          ${waitTime.toFixed(0).padStart(5)}ms            │
│                                              │
├──────────────────────────────────────────────┤
│  Total (wall clock):      ${totalTime.toFixed(0).padStart(5)}ms            │
│  System time only:        ${systemTime.toFixed(0).padStart(5)}ms            │
│  (rpc includes user approval wait)           │
└──────────────────────────────────────────────┘`,
      );

      showTxSuccessToast("Shared counter incremented successfully!", signature);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["counter", "shared", counterId] }),
        queryClient.invalidateQueries({ queryKey: ["shared-counters"] }),
      ]);
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
    mutationFn: async (params: { counterId: string; value: number }): Promise<void> => {
      if (!sharedCounterProgram || !publicKey) {
        throw new Error("Program or wallet not available");
      }

      const signature = await sharedCounterProgram.methods
        .setValue(new anchor.BN(params.value))
        .accountsPartial({
          counter: new anchor.web3.PublicKey(params.counterId),
          caller: publicKey,
        })
        .rpc();

      showTxSuccessToast(`Shared counter set to ${params.value}!`, signature);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["counter", "shared", params.counterId] }),
        queryClient.invalidateQueries({ queryKey: ["shared-counters"] }),
      ]);
    },
    onError: (error) => {
      toast.error("Failed to set shared counter value", {
        description: error.message,
      });
    },
  });

  // ================== Unified API ==================
  return {
    owned: {
      create: createOwnedCounter.mutateAsync,
      increment: incrementOwnedCounter.mutateAsync,
      setValue: setOwnedCounterValue.mutateAsync,
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
      isPending: {
        create: createSharedCounter.isPending,
        increment: incrementSharedCounter.isPending,
        setValue: setSharedCounterValue.isPending,
      },
    },
  };
}

// ================== List Hooks ==================
export function useOwnedCountersList() {
  const { ownedCounterProgram } = useProgram();

  return useQuery({
    queryKey: ["owned-counters"],
    queryFn: async () => {
      if (!ownedCounterProgram) return [];

      const accounts = await ownedCounterProgram.account.ownedCounter.all().catch(() => []);
      return accounts.map(({ publicKey, account }) => ({
        id: publicKey.toString(),
        value: account.value.toString(),
        owner: account.owner.toString(),
        seed: account.seed.toString(),
        type: "owned" as const,
      }));
    },
    enabled: !!ownedCounterProgram,
  });
}

export function useSharedCountersList() {
  const { sharedCounterProgram } = useProgram();

  return useQuery({
    queryKey: ["shared-counters"],
    queryFn: async () => {
      if (!sharedCounterProgram) return [];

      const accounts = await sharedCounterProgram.account.sharedCounter.all().catch(() => []);
      return accounts.map(({ publicKey, account }) => ({
        id: publicKey.toString(),
        value: account.value.toString(),
        seed: account.id.toString(),
        type: "shared" as const,
      }));
    },
    enabled: !!sharedCounterProgram,
  });
}

// ================== Convenience Hooks ==================
export const useOwnedCounterValue = (counterId?: string) => useCounterValue(counterId, "owned");
export const useSharedCounterValue = (counterId?: string) => useCounterValue(counterId, "shared");

// Type exports for better TypeScript experience
export type CounterHookResult = ReturnType<typeof useCounter>;
export type OwnedCounterOperations = CounterHookResult["owned"];
export type SharedCounterOperations = CounterHookResult["shared"];
