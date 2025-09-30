"use client";

import { formatAddress } from "@mysten/sui/utils";
import { ExternalLink } from "lucide-react";
import { CounterDisplay } from "@/components/CounterDisplay";
import { Card, CardContent } from "@/components/ui/card";
import { useCounter, useCounterValue } from "@/hooks/useCounter";

interface OwnedCounterProps {
  id: string;
}

export function OwnedCounter({ id }: OwnedCounterProps) {
  const counter = useCounter();

  // Type-safe data fetching for owned counters only
  const { data, isLoading, error, refetch } = useCounterValue(id);

  // Owned counter operations
  const isIncrementing = counter.owned.isPending.increment;
  const isSettingValue = counter.owned.isPending.setValue;

  const handleIncrement = async () => {
    await counter.owned.increment(id);
    refetch();
  };

  const handleSetValue = async (value: number) => {
    await counter.owned.setValue({ counterId: id, value: BigInt(value) });
    refetch();
  };

  // Handle the case where data is null but no error occurred (legacy object issue)
  const hasDataIssue = !isLoading && !error && !data;

  if (hasDataIssue) {
    return (
      <div className="flex justify-center pt-6">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center text-amber-600">
              <p className="font-semibold">Object Data Unavailable</p>
              <p className="mt-2 text-sm">
                This object exists on the network but cannot be read with the current package
                configuration. It may have been created with an older version of the contract.
              </p>
              <p className="mt-4 text-muted-foreground text-xs">Counter ID: {formatAddress(id)}</p>
              <div className="mt-4">
                <a
                  href={`https://testnet.suivision.xyz/object/${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 text-blue-500 text-sm hover:text-blue-700"
                >
                  View on SuiVision Explorer <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <CounterDisplay
      id={id}
      title="Owned Counter"
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
