"use client";

import { formatAddress } from "@mysten/sui/utils";
import { ExternalLink, Eye, EyeOff, Loader2, Shield } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="flex justify-center pt-6">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!onChainData) {
    return (
      <div className="flex justify-center pt-6">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center text-amber-600">
              <p className="font-semibold">Counter Not Found</p>
              <p className="mt-2 text-sm">
                This counter object could not be found on the network or is not accessible.
              </p>
              <p className="mt-4 text-muted-foreground text-xs">Counter ID: {formatAddress(id)}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!localState) {
    return (
      <div className="flex justify-center pt-6">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center text-amber-600">
              <p className="font-semibold">Local Secrets Not Found</p>
              <p className="mt-2 text-sm">
                This counter exists on-chain but the local secrets were not found in your browser.
                You cannot increment this counter without the secrets.
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
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-6 pt-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center justify-center gap-2 text-center">
            <Shield className="h-5 w-5" />
            Private Counter
          </CardTitle>
          <CardDescription className="flex items-center justify-center gap-1">
            <span>Counter ID: {formatAddress(id)}</span>
            <a
              href={`https://testnet.suivision.xyz/object/${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-blue-500 hover:text-blue-700"
              title="View on SuiVision Explorer"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Value Display */}
          <div className="text-center">
            <div className="font-bold text-4xl text-primary">{localState.value.toString()}</div>
            <p className="mt-2 text-muted-foreground text-sm">Current Value (Private)</p>
          </div>

          {/* Increment Button */}
          <Button onClick={handleIncrement} disabled={isIncrementing} className="w-full" size="lg">
            {isIncrementing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating ZK Proof...
              </>
            ) : (
              "Increment (with ZK Proof)"
            )}
          </Button>

          {/* Error Display */}
          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* On-chain State */}
          <div className="space-y-2 border-t pt-4">
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

          {/* Local Secrets (Collapsible) */}
          <div className="space-y-2 border-t pt-4">
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
        </CardContent>
      </Card>
    </div>
  );
}
