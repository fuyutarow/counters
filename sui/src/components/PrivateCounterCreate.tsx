"use client";

import { Loader2, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePrivateCounter } from "@/hooks/usePrivateCounter";

export function PrivateCounterCreate() {
  const router = useRouter();
  const { create, isCreating } = usePrivateCounter();
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setError(null);
    try {
      await create();
      // Optionally navigate to the counter page or refresh the list
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create counter");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Create Private Counter
        </CardTitle>
        <CardDescription>
          Create a new private counter with zero-knowledge proofs. Your counter value remains secret
          while proving valid increments on-chain.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-4 text-sm">
            <p className="font-medium">Privacy Features:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
              <li>Counter value is never revealed on-chain</li>
              <li>ZK proofs verify valid increments without exposing the value</li>
              <li>Your secrets are stored locally in your browser</li>
              <li>Initial value starts at 0</li>
            </ul>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
              {error}
            </div>
          )}

          <Button onClick={handleCreate} disabled={isCreating} className="w-full">
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Private Counter...
              </>
            ) : (
              "Create Private Counter"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
