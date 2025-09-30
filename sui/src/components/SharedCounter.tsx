"use client";

import { CounterDisplay } from "@/components/CounterDisplay";
import { useCounter, useCounterValue } from "@/hooks/useCounter";

interface SharedCounterProps {
  id: string;
}

export function SharedCounter({ id }: SharedCounterProps) {
  const counter = useCounter();

  // Type-safe data fetching for shared counters only
  const { data, isLoading, error, refetch } = useCounterValue(id);

  // Shared counter operations
  const isIncrementing = counter.shared.isPending.increment;
  const isSettingValue = counter.shared.isPending.setValue;

  const handleIncrement = async () => {
    await counter.shared.increment(id);
    refetch();
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
      isSettingValue={isSettingValue}
      onIncrement={handleIncrement}
      onSetValue={handleSetValue}
      error={error}
    />
  );
}
