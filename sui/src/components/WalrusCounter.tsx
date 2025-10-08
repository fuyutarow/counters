"use client";

import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { formatAddress } from "@mysten/sui/utils";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { ResultAsync } from "neverthrow";
import { useState } from "react";
import { toast } from "sonner";
import { CounterDisplay } from "@/components/CounterDisplay";
import { Card, CardContent } from "@/components/ui/card";
import * as walrusCounter from "@/generated/counter/walrus_counter";
import { createCounterBlob, readCounterValue } from "@/lib/walrusClient";

interface WalrusCounterProps {
  id: string;
}

export function WalrusCounter({ id }: WalrusCounterProps) {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const [isIncrementing, setIsIncrementing] = useState(false);
  const [isSettingValue, setIsSettingValue] = useState(false);

  // Fetch WalrusCounter object and blob data
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["walrus-counter", id],
    queryFn: async () => {
      const obj = await suiClient.getObject({
        id,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
        return null;
      }

      const fields = obj.data.content.fields as Record<string, unknown>;
      const blob = fields.blob as Record<string, unknown> | undefined;
      const blobFields = blob?.fields as Record<string, unknown> | undefined;
      const blobId = blobFields?.blob_id as string | undefined;

      if (!blobId) {
        throw new Error("No blob_id found");
      }

      // Read counter value from Walrus blob
      const counterValue = await readCounterValue(blobId);

      return {
        id,
        blobId,
        value: String(counterValue),
      };
    },
    enabled: !!id,
  });

  const handleIncrement = async () => {
    if (!currentAccount || !data) return;

    setIsIncrementing(true);

    const result = await ResultAsync.fromPromise(
      (async () => {
        // Read current value
        const currentValue = Number.parseInt(data.value, 10);

        // Create new blob with incremented value
        const newBlobId = await createCounterBlob(currentValue + 1);

        // Unwrap old blob and wrap new blob
        const tx = new Transaction();
        const counterObj = tx.object(id);
        walrusCounter.unwrap({ arguments: [counterObj] })(tx);

        const newBlobObj = tx.object(newBlobId);
        walrusCounter.wrap({ arguments: [newBlobObj] })(tx);

        await signAndExecuteTransaction({ transaction: tx });
      })(),
      (err) => (err instanceof Error ? err.message : "Unknown error"),
    );

    result.match(
      () => {
        toast.success("Counter incremented!");
        refetch();
      },
      () => {
        toast.error("Failed to increment counter");
      },
    );

    setIsIncrementing(false);
  };

  const handleSetValue = async (value: number) => {
    if (!currentAccount) return;

    setIsSettingValue(true);

    const result = await ResultAsync.fromPromise(
      (async () => {
        // Create new blob with specified value
        const newBlobId = await createCounterBlob(value);

        // Unwrap old blob and wrap new blob
        const tx = new Transaction();
        const counterObj = tx.object(id);
        walrusCounter.unwrap({ arguments: [counterObj] })(tx);

        const newBlobObj = tx.object(newBlobId);
        walrusCounter.wrap({ arguments: [newBlobObj] })(tx);

        await signAndExecuteTransaction({ transaction: tx });
      })(),
      (err) => (err instanceof Error ? err.message : "Unknown error"),
    );

    result.match(
      () => {
        toast.success("Counter value updated!");
        refetch();
      },
      () => {
        toast.error("Failed to set counter value");
      },
    );

    setIsSettingValue(false);
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
