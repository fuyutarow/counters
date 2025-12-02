"use client";

import { Key, Server, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMultiIBSCounter } from "@/hooks/useMultiIBSCounter";

export function MultiIBSCounterCreate() {
  const router = useRouter();
  const counter = useMultiIBSCounter();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    try {
      setIsCreating(true);
      const counterId = await counter.create();
      router.push(`/multi-ibs-counter/${counterId}`);
    } catch (_error) {
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Key Server Information */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Key Server Configuration</h3>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {counter.keyServers.map((server, index) => (
            <Card key={server.objectId} className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Key className="h-4 w-4" />
                  {server.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  <Badge variant="outline" className="text-xs">
                    Server #{index + 1}
                  </Badge>
                  <p className="font-mono text-muted-foreground text-xs">
                    {server.objectId.slice(0, 8)}...{server.objectId.slice(-6)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Threshold Information */}
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <Shield className="h-5 w-5" />
            Threshold Signature Scheme
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            <p className="text-amber-700 text-sm dark:text-amber-300">
              <strong>
                {counter.threshold}-of-{counter.keyServers.length}
              </strong>{" "}
              signature threshold
            </p>
            <p className="text-amber-600 text-xs dark:text-amber-400">
              Requires {counter.threshold} key servers to successfully sign any operation
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Create Button */}
      <div className="flex justify-center">
        <Button
          onClick={handleCreate}
          disabled={isCreating || counter.isPending.create}
          size="lg"
          className="gap-2"
        >
          {isCreating || counter.isPending.create ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Creating Multi-IBS Counter...
            </>
          ) : (
            <>
              <Shield className="h-4 w-4" />
              Create Multi-IBS Counter
            </>
          )}
        </Button>
      </div>

      {/* Info Text */}
      <div className="text-center text-muted-foreground text-sm">
        <p>This will deploy a new counter secured by Boneh-Franklin Identity-Based Signatures</p>
        <p className="mt-1">using distributed key servers for threshold signature generation</p>
      </div>
    </div>
  );
}
