"use client";

import { formatAddress } from "@mysten/sui/utils";
import { ExternalLink } from "lucide-react";
import { CounterDisplay } from "@/components/CounterDisplay";
import { Card, CardContent } from "@/components/ui/card";
import { useWalrusCounter } from "@/hooks/useWalrusCounter";

interface WalrusCounterProps {
  id: string;
}

export function WalrusCounter({ id }: WalrusCounterProps) {
  const walrusCounter = useWalrusCounter();

  // Fetch counter value using the hook
  const { data, isLoading, error } = walrusCounter.useValue(id);

  // Operations
  const isIncrementing = walrusCounter.isPending.increment;
  const isSettingValue = walrusCounter.isPending.setValue;

  const handleIncrement = async () => {
    if (!data) return;
    const currentValue = Number.parseInt(data.value, 10);
    await walrusCounter.increment({ counterId: id, currentValue });
  };

  const handleSetValue = async (value: number) => {
    await walrusCounter.setValue({ counterId: id, value });
  };

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
                configuration.
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
      title="Walrus Counter"
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
