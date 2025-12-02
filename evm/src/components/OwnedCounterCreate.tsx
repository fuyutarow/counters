"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCounter } from "@/hooks/useCounter";

export function OwnedCounterCreate() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const counter = useCounter();
  const { mint, isPending } = counter.owned;

  const handleCreateCounter = async () => {
    const result = await mint();
    result.match(
      (data) => {
        toast.success("Owned counter created successfully!");
        router.push(`/owned-counter/${data.counterId}`);
      },
      () => {
        toast.error("Failed to create counter");
      },
    );
  };

  if (!isConnected) {
    return (
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle>Create Owned Counter</CardTitle>
          <CardDescription>Connect your wallet to create a new counter</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <ConnectButton />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle>Create Owned Counter</CardTitle>
        <CardDescription>Mint a new counter that only you can control</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button onClick={handleCreateCounter} disabled={isPending.mint} size="lg" className="gap-2">
          <Plus className="h-4 w-4" />
          {isPending.mint ? "Creating..." : "Create New Counter"}
        </Button>
      </CardContent>
    </Card>
  );
}
