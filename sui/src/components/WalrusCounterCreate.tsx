"use client";

import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { Loader2 } from "lucide-react";
import { ResultAsync } from "neverthrow";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import * as walrusCounter from "@/generated/counter/walrus_counter";
import { createCounterBlob } from "@/lib/walrusClient";
import { useNetworkVariable } from "@/networkConfig";

export function WalrusCounterCreate({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const counterPackageId = useNetworkVariable("counterPackageId");
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreate() {
    if (!currentAccount) {
      toast.error("Please connect your wallet");
      return;
    }

    setIsCreating(true);

    const result = await ResultAsync.fromPromise(
      (async () => {
        toast.info("Creating Walrus blob...");
        const blobId = await createCounterBlob(0, currentAccount.address);
        toast.info("Creating WalrusCounter on-chain...");
        const tx = new Transaction();
        const counter = walrusCounter._new({
          package: counterPackageId,
          arguments: [tx.object(blobId)],
        })(tx);
        tx.transferObjects([counter], currentAccount.address);
        const txResult = await signAndExecuteTransaction({
          transaction: tx,
        });
        const txResponse = await suiClient.waitForTransaction({
          digest: txResult.digest,
          options: {
            showEffects: true,
          },
        });

        const createdObject = txResponse.effects?.created?.[0];
        if (!createdObject?.reference?.objectId) {
          throw new Error("Failed to get created object ID");
        }

        return {
          counterId: createdObject.reference.objectId,
          digest: txResult.digest,
        };
      })(),
      (err) => {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        return errorMsg;
      },
    );

    result.match(
      ({ counterId, digest }) => {
        toast.success("WalrusCounter created!", {
          description: (
            <a
              href={`https://testnet.suivision.xyz/txblock/${digest}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              View transaction
            </a>
          ),
        });
        onSuccess?.();
        router.push(`/walrus-counter/${counterId}`);
      },
      (errorMsg) => {
        toast.error("Failed to create WalrusCounter", {
          description: errorMsg,
        });
      },
    );

    setIsCreating(false);
  }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create Walrus Counter</CardTitle>
          <CardDescription>
            Create a counter with decentralized blob storage on Walrus
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            size="lg"
            onClick={handleCreate}
            disabled={isCreating || !currentAccount}
            className="w-full"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Walrus Counter"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
