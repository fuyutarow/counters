"use client";

import { formatAddress } from "@mysten/sui/utils";
import { ExternalLink, Eye, EyeOff, Loader2, Shield } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePrivateCounter } from "@/hooks/usePrivateCounter";

interface PrivateCounterProps {
  id: string;
}

export function PrivateCounter({ id }: PrivateCounterProps) {
  const { increment, isIncrementing, usePrivateCounterValue, getLocalCounterState } =
    usePrivateCounter();
  const [error, setError] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);

  // Fetch on-chain data
  const { data: onChainData, isLoading, refetch } = usePrivateCounterValue(id);

  // Get local secrets
  const localState = getLocalCounterState(id);

  const handleIncrement = async () => {
    setError(null);
    try {
      await increment(id);
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to increment counter");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!onChainData) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center text-amber-600">
            <p className="font-semibold">Counter Not Found</p>
            <p className="mt-2 text-sm">
              This counter object could not be found on the network or is not accessible.
            </p>
            <p className="mt-4 text-muted-foreground text-xs">Counter ID: {formatAddress(id)}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!localState) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center text-amber-600">
            <p className="font-semibold">Local Secrets Not Found</p>
            <p className="mt-2 text-sm">
              This counter exists on-chain but the local secrets were not found in your browser. You
              cannot increment this counter without the secrets.
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
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Private Counter
          </div>
          <a
            href={`https://testnet.suivision.xyz/object/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 text-sm hover:text-blue-700"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* On-chain Data */}
        <div className="space-y-2">
          <h3 className="font-medium text-sm">On-Chain State (Public)</h3>
          <div className="rounded-lg bg-muted p-3 font-mono text-xs">
            <div className="space-y-1">
              <div>
                <span className="text-muted-foreground">Value Hash:</span>
                <br />
                <span className="break-all">{onChainData.valueHash}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Salt Hash:</span>
                <br />
                <span className="break-all">{onChainData.saltHash}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Local Secrets */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Local Secrets (Private)</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSecrets(!showSecrets)}
              className="h-6 px-2"
            >
              {showSecrets ? (
                <>
                  <EyeOff className="mr-1 h-3 w-3" />
                  Hide
                </>
              ) : (
                <>
                  <Eye className="mr-1 h-3 w-3" />
                  Show
                </>
              )}
            </Button>
          </div>
          {showSecrets && (
            <div className="rounded-lg bg-muted p-3 font-mono text-xs">
              <div className="space-y-1">
                <div>
                  <span className="text-muted-foreground">Current Value:</span>{" "}
                  <span className="font-bold text-green-600">{localState.value.toString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Salt (fixed):</span>
                  <br />
                  <span className="break-all">{localState.salt.toString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <Button onClick={handleIncrement} disabled={isIncrementing} className="w-full">
            {isIncrementing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Proof & Incrementing...
              </>
            ) : (
              "Increment (with ZK Proof)"
            )}
          </Button>
          <p className="text-center text-muted-foreground text-xs">
            Current value:{" "}
            <span className="font-bold text-green-600">{localState.value.toString()}</span>
          </p>
        </div>

        {/* Counter ID */}
        <div className="border-t pt-2 text-center text-muted-foreground text-xs">
          Counter ID: {formatAddress(id)}
        </div>
      </CardContent>
    </Card>
  );
}
