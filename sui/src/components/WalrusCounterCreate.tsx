"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWalrusCounter } from "@/hooks/useWalrusCounter";

export function WalrusCounterCreate({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const currentAccount = useCurrentAccount();
  const walrusCounter = useWalrusCounter();

  function handleCreate() {
    if (!currentAccount) {
      toast.error("Please connect your wallet");
      return;
    }

    walrusCounter.create().then((counterId) => {
      onSuccess?.();
      router.push(`/walrus-counter/${counterId}`);
    });
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
            disabled={walrusCounter.isPending.create || !currentAccount}
            className="w-full"
          >
            {walrusCounter.isPending.create ? (
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
