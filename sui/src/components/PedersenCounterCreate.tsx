"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePedersenCounter } from "@/hooks/usePedersenCounter";

export function PedersenCounterCreate({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const pedersenCounter = usePedersenCounter();
  const [initialValue, setInitialValue] = useState("0");
  const inputId = useId();

  const isCreating = pedersenCounter.isPending.create;

  function handleCreate() {
    const value = BigInt(initialValue);
    pedersenCounter.create({ initialValue: value }).then((counterId) => {
      onSuccess?.();
      router.push(`/pedersen-counter/${counterId}`);
    });
  }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create Pedersen Counter</CardTitle>
          <CardDescription>
            Create a counter using Pedersen commitments to hide the actual value while allowing
            homomorphic operations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={inputId}>Initial Value (Committed)</Label>
            <Input
              id={inputId}
              type="number"
              min="0"
              value={initialValue}
              onChange={(e) => setInitialValue(e.target.value)}
              placeholder="Enter initial value"
              disabled={isCreating}
            />
            <p className="text-muted-foreground text-xs">
              This value will be hidden using a Pedersen commitment. Only you will know the actual
              value.
            </p>
          </div>

          <Button size="lg" onClick={handleCreate} disabled={isCreating} className="w-full">
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Commitment...
              </>
            ) : (
              "Create Pedersen Counter"
            )}
          </Button>

          <div className="space-y-2 rounded-md bg-muted p-3 text-xs">
            <p className="font-semibold">🔐 Privacy Features:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Value is hidden using cryptographic commitment</li>
              <li>Random blinding factor ensures security</li>
              <li>Homomorphic increments preserve privacy</li>
              <li>Only commitment (48 bytes) is stored on-chain</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
