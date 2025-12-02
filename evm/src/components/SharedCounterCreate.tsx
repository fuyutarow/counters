"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCounter } from "@/hooks/useCounter";

export function SharedCounterCreate() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const counter = useCounter();
  const { create, isPending } = counter.shared;

  const handleCreateCounter = async () => {
    const result = await create();
    result.match(
      (data) => {
        toast.success("Shared counter created successfully!");
        router.push(`/shared-counter/${data.counterId}`);
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
          <CardTitle>Create Shared Counter</CardTitle>
          <CardDescription>Connect your wallet to create a new shared counter</CardDescription>
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
        <CardTitle>Create Shared Counter</CardTitle>
        <CardDescription>Create a new counter that anyone can interact with</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button
          onClick={handleCreateCounter}
          disabled={isPending.create}
          size="lg"
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          {isPending.create ? "Creating..." : "Create New Counter"}
        </Button>
      </CardContent>
    </Card>
  );
}
