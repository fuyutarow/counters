"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCounter } from "@/hooks/useCounter";
import { useProgram } from "@/hooks/useProgram";

export function SharedCounterCreate() {
  const router = useRouter();
  const counter = useCounter();
  const { isConnected } = useProgram();

  const isCreating = counter.shared.isPending.create;

  const handleCreate = () => {
    counter.shared.create().then((counterId) => {
      router.push(`/shared-counter/${counterId}`);
    });
  };

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            <p>Please connect your wallet to create a counter</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Create New Shared Counter
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            Create a new shared counter that anyone can interact with. A unique address will be
            automatically generated.
          </p>
        </div>

        <Button onClick={handleCreate} disabled={isCreating} className="w-full">
          {isCreating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating Counter...
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Create Shared Counter
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
