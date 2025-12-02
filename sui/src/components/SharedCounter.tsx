"use client";

import { Transaction } from "@mysten/sui/transactions";
import { useQueryClient } from "@tanstack/react-query";
import { CounterDisplay } from "@/components/CounterDisplay";
import * as sharedCounter from "@/generated/counter/shared_counter";
import { useCounter, useCounterValue } from "@/hooks/useCounter";
import { usePreallocatedTransaction } from "@/hooks/usePreallocatedTransaction";
import { useSponsoredTransaction } from "@/hooks/useSponsoredTransaction";
import { useNetworkVariable } from "@/networkConfig";

interface SharedCounterProps {
  id: string;
}

export function SharedCounter({ id }: SharedCounterProps) {
  const counter = useCounter();
  const queryClient = useQueryClient();
  const counterPackageId = useNetworkVariable("counterPackageId");

  // Type-safe data fetching for shared counters only
  const { data, isLoading, error, refetch } = useCounterValue(id);

  // Enoki sponsored transaction hook
  const sponsoredTx = useSponsoredTransaction({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["counter", id] });
      queryClient.invalidateQueries({ queryKey: ["shared-counters"] });
      refetch();
    },
  });

  // Pre-allocated 1RT transaction hook
  const preallocTx = usePreallocatedTransaction({
    onSuccess: () => {
      refetch();
    },
  });

  // Shared counter operations
  const isIncrementing = counter.shared.isPending.increment;
  const isSponsoredIncrementing = sponsoredTx.isPending;
  const isPreallocIncrementing = preallocTx.isPending;
  const isSettingValue = counter.shared.isPending.setValue;

  const handleIncrement = async () => {
    await counter.shared.increment(id);
    refetch();
  };

  const handleIncrementSponsored = async () => {
    const tx = new Transaction();
    sharedCounter.increment({
      package: counterPackageId,
      arguments: [tx.object(id)],
    })(tx);
    await sponsoredTx.mutateAsync(tx);
  };

  const handleIncrementPrealloc = async () => {
    const tx = new Transaction();
    sharedCounter.increment({
      package: counterPackageId,
      arguments: [tx.object(id)],
    })(tx);
    await preallocTx.mutateAsync(tx);
  };

  const handleSetValue = async (value: number) => {
    await counter.shared.setValue({ counterId: id, value: BigInt(value) });
    refetch();
  };

  return (
    <CounterDisplay
      id={id}
      title="Shared Counter"
      value={data?.value ?? ""}
      isLoading={isLoading}
      isIncrementing={isIncrementing}
      isSponsoredIncrementing={isSponsoredIncrementing}
      isPreallocIncrementing={isPreallocIncrementing}
      isSettingValue={isSettingValue}
      onIncrement={handleIncrement}
      onIncrementSponsored={handleIncrementSponsored}
      onIncrementPrealloc={handleIncrementPrealloc}
      onSetValue={handleSetValue}
      error={error}
      hasAllocation={preallocTx.hasAllocation}
    />
  );
}
