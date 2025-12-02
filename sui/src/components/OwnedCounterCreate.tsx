"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { type SuiObjectChange } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Loader2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import * as ownedCounter from "@/generated/counter/owned_counter";
import { useCounter } from "@/hooks/useCounter";
import { useSponsoredTransaction } from "@/hooks/useSponsoredTransaction";
import { useNetworkVariable } from "@/networkConfig";

export function OwnedCounterCreate({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const counter = useCounter();
  const account = useCurrentAccount();
  const counterPackageId = useNetworkVariable("counterPackageId");

  const sponsoredTx = useSponsoredTransaction();

  const isCreatingOwned = counter.owned.isPending.create;
  const isCreatingSponsored = sponsoredTx.isPending;

  function handleCreateOwned() {
    counter.owned.create().then((counterId) => {
      onSuccess?.();
      router.push(`/owned-counter/${counterId}`);
    });
  }

  async function handleCreateOwnedSponsored() {
    if (!account?.address) return;

    const tx = new Transaction();
    const counterObj = ownedCounter._new({ package: counterPackageId })(tx);
    tx.transferObjects([counterObj], account.address);

    const result = await sponsoredTx.mutateAsync(tx);
    const created = result.objectChanges?.find((c: SuiObjectChange) => c.type === "created");
    if (created && created.type === "created") {
      onSuccess?.();
      router.push(`/owned-counter/${created.objectId}`);
    }
  }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create Owned Counter</CardTitle>
          <CardDescription>
            Create a personal counter that only you can access and modify
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            size="lg"
            onClick={handleCreateOwned}
            disabled={isCreatingOwned || isCreatingSponsored}
            className="w-full"
          >
            {isCreatingOwned ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Owned Counter"
            )}
          </Button>

          <Button
            size="lg"
            variant="outline"
            onClick={handleCreateOwnedSponsored}
            disabled={isCreatingOwned || isCreatingSponsored}
            className="w-full border-yellow-500 text-yellow-600 hover:bg-yellow-50"
          >
            {isCreatingSponsored ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Create with Enoki (Gas-free)
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
