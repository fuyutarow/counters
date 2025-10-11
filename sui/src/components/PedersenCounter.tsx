"use client";

import { useSuiClient } from "@mysten/dapp-kit";
import { formatAddress } from "@mysten/sui/utils";
import { useQuery } from "@tanstack/react-query";
import consola from "consola";
import { Copy, ExternalLink, Eye, Loader2, Shield } from "lucide-react";
import { ResultAsync } from "neverthrow";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePedersenCounter } from "@/hooks/usePedersenCounter";
import { type OpeningResult, usePedersenOpening } from "@/hooks/usePedersenOpening";

interface PedersenCounterProps {
  id: string;
}

export function PedersenCounter({ id }: PedersenCounterProps) {
  const suiClient = useSuiClient();
  const pedersenCounter = usePedersenCounter();
  const opening = usePedersenOpening();
  const [incrementValue, setIncrementValue] = useState("1");
  const [openResult, setOpenResult] = useState<OpeningResult | null>(null);
  const inputId = useId();

  // Fetch counter data
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["pedersen-counter", id],
    queryFn: async () => {
      consola.log("[PedersenCounter] Fetching object:", id);
      const obj = await suiClient.getObject({
        id,
        options: { showContent: true, showType: true },
      });

      consola.log("[PedersenCounter] Object response:", obj);

      if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
        consola.warn("[PedersenCounter] Invalid object data:", obj.data);
        return null;
      }

      consola.log("[PedersenCounter] Content:", obj.data.content);
      consola.log("[PedersenCounter] Type:", obj.data.type);

      const fields = obj.data.content.fields as Record<string, unknown>;
      consola.log("[PedersenCounter] Fields:", fields);

      const commitment = fields.commitment as Record<string, unknown>;
      consola.log("[PedersenCounter] Commitment:", commitment);

      if (!commitment || typeof commitment !== "object" || !("fields" in commitment)) {
        consola.warn("[PedersenCounter] Invalid commitment structure - no fields");
        return null;
      }

      const commitmentFields = commitment.fields as Record<string, unknown>;
      consola.log("[PedersenCounter] Commitment fields:", commitmentFields);

      if (!commitmentFields || !("bytes" in commitmentFields)) {
        consola.warn("[PedersenCounter] Invalid commitment fields - no bytes");
        return null;
      }

      const bytes = commitmentFields.bytes as number[];

      return {
        id,
        commitmentBytes: bytes,
        version: obj.data.version,
      };
    },
    enabled: !!id,
  });

  const isIncrementing = pedersenCounter.isPending.increment;

  const handleIncrement = async () => {
    const value = BigInt(incrementValue);
    if (value <= 0n) {
      toast.error("Increment value must be positive");
      return;
    }

    const result = await ResultAsync.fromPromise(
      pedersenCounter.increment({ counterId: id, incrementValue: value }),
      (err) => new Error(err instanceof Error ? err.message : String(err)),
    );

    if (result.isErr()) {
      consola.error("Failed to increment:", result.error);
      toast.error("Failed to increment counter");
      return;
    }

    // Clear previous opening result since commitment changed
    setOpenResult(null);
    refetch();
  };

  const handleOpen = async () => {
    if (!data) return;

    const result = await opening.open(id, data.commitmentBytes);
    setOpenResult(result);

    if (result.success) {
      toast.success("Commitment opened successfully!", {
        description: `Revealed value: ${result.value}`,
      });
    } else {
      toast.error("Failed to open commitment", {
        description: result.error,
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const formatCommitment = (bytes: number[]): string => {
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center pt-6">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              <p className="font-semibold">Error Loading Counter</p>
              <p className="mt-2 text-sm">{(error as Error).message}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex justify-center pt-6">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center text-amber-600">
              <p className="font-semibold">Object Data Unavailable</p>
              <p className="mt-2 text-sm">
                This object exists on the network but cannot be read with the current package
                configuration.
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
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2 font-bold text-2xl">
              <Shield className="h-6 w-6" />
              Pedersen Counter
            </h1>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <code className="font-mono">{formatAddress(id)}</code>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => copyToClipboard(id)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <Badge variant="secondary">Version {data.version}</Badge>
        </div>

        {/* Commitment Display */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Commitment (Hidden Value)</span>
              <Badge variant="outline" className="font-mono">
                🔐 Private
              </Badge>
            </CardTitle>
            <CardDescription>
              The actual counter value is hidden using a Pedersen commitment. Only the commitment
              (48 bytes) is stored on-chain.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Commitment Bytes (BLS12-381 G1 Point)</Label>
              <div className="rounded-lg border bg-muted p-3">
                <code className="block break-all font-mono text-xs">
                  {formatCommitment(data.commitmentBytes)}
                </code>
              </div>
              <p className="text-muted-foreground text-xs">
                48 bytes (compressed G1 point on BLS12-381 curve)
              </p>
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
              <p className="font-medium text-sm">⚠️ Privacy Note</p>
              <p className="mt-1 text-muted-foreground text-xs">
                The actual value is cryptographically hidden. Only you know the true count, as the
                blinding factor was generated locally in your browser.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Increment Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Homomorphic Increment</CardTitle>
            <CardDescription>
              Add to the counter without revealing the value. The operation happens on encrypted
              data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={inputId}>Increment Amount</Label>
              <Input
                id={inputId}
                type="number"
                min="1"
                value={incrementValue}
                onChange={(e) => setIncrementValue(e.target.value)}
                placeholder="Enter amount to increment"
                disabled={isIncrementing}
              />
            </div>

            <Button
              size="lg"
              onClick={handleIncrement}
              disabled={isIncrementing}
              className="w-full"
            >
              {isIncrementing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Incrementing...
                </>
              ) : (
                `Increment by ${incrementValue}`
              )}
            </Button>

            <div className="space-y-2 rounded-md bg-muted p-3 text-xs">
              <p className="font-semibold">How it works:</p>
              <ol className="ml-4 list-decimal space-y-1">
                <li>A new commitment is created for the increment value</li>
                <li>The commitments are added homomorphically on-chain</li>
                <li>Result: C_new = C_old + C_increment</li>
                <li>The actual value remains hidden throughout</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Opening (Reveal Value) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Open Commitment (Reveal Value)
            </CardTitle>
            <CardDescription>
              Reveal the actual counter value using secrets stored in your browser. This verifies
              that you created this counter.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {opening.checkHasSecrets(id) ? (
              <>
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={handleOpen}
                  disabled={opening.isOpening}
                  className="w-full"
                >
                  {opening.isOpening ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Opening...
                    </>
                  ) : (
                    <>
                      <Eye className="mr-2 h-4 w-4" />
                      Open Commitment
                    </>
                  )}
                </Button>

                {openResult?.success && openResult.value !== undefined && (
                  <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                    <AlertTitle className="text-green-900 dark:text-green-100">
                      ✅ Commitment Opened Successfully
                    </AlertTitle>
                    <AlertDescription className="mt-2">
                      <div className="space-y-2">
                        <p className="text-muted-foreground text-sm">Revealed counter value:</p>
                        <div className="rounded-lg border bg-background p-4">
                          <p className="font-bold text-3xl text-green-600 dark:text-green-400">
                            {openResult.value.toString()}
                          </p>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          This value was cryptographically verified against the on-chain commitment.
                        </p>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {openResult && !openResult.success && (
                  <Alert variant="destructive">
                    <AlertTitle>❌ Opening Failed</AlertTitle>
                    <AlertDescription className="text-sm">{openResult.error}</AlertDescription>
                  </Alert>
                )}

                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
                  <p className="font-medium text-sm">ℹ️ How Opening Works</p>
                  <ol className="mt-2 ml-4 list-decimal space-y-1 text-muted-foreground text-xs">
                    <li>Retrieve stored value and blinding factor from localStorage</li>
                    <li>Recreate the commitment: C = value × G + blinding × H</li>
                    <li>Compare with on-chain commitment byte-by-byte</li>
                    <li>If they match, the value is cryptographically proven correct</li>
                  </ol>
                </div>
              </>
            ) : (
              <Alert variant="destructive">
                <AlertTitle>🔒 No Secrets Available</AlertTitle>
                <AlertDescription className="space-y-2 text-sm">
                  <p>No secrets found for this counter in localStorage. This can happen if:</p>
                  <ul className="ml-4 list-disc space-y-1">
                    <li>This counter was created on a different device or browser</li>
                    <li>Your browser&apos;s localStorage was cleared</li>
                    <li>You&apos;re viewing someone else&apos;s counter</li>
                  </ul>
                  <p className="mt-2 font-semibold">
                    💡 Only the creator can reveal the value of a Pedersen counter.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
              <p className="font-medium text-sm">⚠️ Security Notice</p>
              <p className="mt-1 text-muted-foreground text-xs">
                Secrets are stored in plaintext in your browser&apos;s localStorage. They are not
                encrypted and will be permanently lost if localStorage is cleared. Consider
                exporting your secrets for backup if you need long-term access.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Explorer Link */}
        <div className="flex justify-center">
          <a
            href={`https://testnet.suivision.xyz/object/${id}?tab=Overview&network=testnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-500 text-sm hover:text-blue-700"
          >
            View on SuiVision Explorer
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
