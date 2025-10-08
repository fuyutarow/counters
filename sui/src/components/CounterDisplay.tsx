"use client";

import { formatAddress } from "@mysten/sui/utils";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface CounterDisplayProps {
  id: string;
  title: string;
  value: string;
  isLoading: boolean;
  isIncrementing: boolean;
  isSettingValue: boolean;
  onIncrement: () => void;
  onSetValue: (value: number) => void;
  error?: Error | null;
}

export function CounterDisplay({
  id,
  title,
  value,
  isLoading,
  isIncrementing,
  isSettingValue,
  onIncrement,
  onSetValue,
  error,
}: CounterDisplayProps) {
  const [customValue, setCustomValue] = useState("");

  const handleSetValue = () => {
    const numValue = Number.parseInt(customValue, 10);
    if (Number.isNaN(numValue)) {
      return;
    }
    onSetValue(numValue);
    setCustomValue("");
  };

  if (error && !isLoading) {
    const isWalrusError = error.message.includes("Failed to read blob from Walrus");
    const is404Error = error.message.includes("404");

    return (
      <div className="flex justify-center pt-6">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center text-red-500">
              <p className="font-semibold">
                {isWalrusError ? "Walrus Blob Error" : "Failed to load counter"}
              </p>
              <p className="mt-2 text-sm">{error.message}</p>
              {is404Error && (
                <p className="mt-3 text-amber-600 text-sm">
                  The blob may have expired or been deleted from the Walrus network.
                </p>
              )}
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
          <CardTitle className="text-center">{title}</CardTitle>
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
          <div className="text-center">
            {isLoading ? (
              <div className="flex h-12 items-center justify-center">
                <div className="text-muted-foreground">Loading...</div>
              </div>
            ) : (
              <div className="font-bold text-4xl text-primary">{value || "—"}</div>
            )}
          </div>

          <Button
            onClick={onIncrement}
            disabled={isIncrementing || isLoading}
            className="w-full"
            size="lg"
          >
            {isIncrementing ? "Incrementing..." : "Increment"}
          </Button>

          <div className="space-y-2">
            <Input
              type="number"
              placeholder="Enter custom value"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              disabled={isSettingValue}
            />
            <Button
              onClick={handleSetValue}
              disabled={isSettingValue || isLoading || !customValue}
              variant="outline"
              className="w-full"
            >
              {isSettingValue ? "Setting..." : "Set Value"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
