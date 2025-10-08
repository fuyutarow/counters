"use client";

import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { formatAddress } from "@mysten/sui/utils";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { ResultAsync } from "neverthrow";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { CounterDisplay } from "@/components/CounterDisplay";
import { Card, CardContent } from "@/components/ui/card";
import * as walrusCounter from "@/generated/counter/walrus_counter";
import { createCounterBlob, readCounterValue } from "@/lib/walrusClient";

/**
 * WalrusCounter Move構造体のフィールド型定義
 *
 * zodが必要な理由：
 * - @mysten/sui SDKの型定義は `fields: { [key: string]: MoveValue }` と緩い
 * - MoveValueは `number | boolean | string | ...` のユニオン型
 * - 具体的なMove構造体の型情報が失われているため、zodで型を具体化する
 */
const walrusCounterFieldsSchema = z.object({
  blob: z.object({
    fields: z.object({
      blob_id: z.string(),
    }),
  }),
});

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

      const parseResult = walrusCounterFieldsSchema.safeParse(obj.data.content.fields);

      if (!parseResult.success) {
        throw new Error(`Invalid WalrusCounter fields: ${parseResult.error.message}`);
      }

      const blobId = parseResult.data.blob.fields.blob_id;

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

        // Replace blob in counter
        const tx = new Transaction();
        walrusCounter.replace({ arguments: [tx.object(id), tx.object(newBlobId)] })(tx);

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

        // Replace blob in counter
        const tx = new Transaction();
        walrusCounter.replace({ arguments: [tx.object(id), tx.object(newBlobId)] })(tx);

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
