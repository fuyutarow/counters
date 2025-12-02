"use client";

import { Droplets, ExternalLink } from "lucide-react";
import { fromPromise } from "neverthrow";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useAccount, useChainId } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

export function AppBar() {
  const { address } = useAccount();
  const chainId = useChainId();
  const [isFaucetLoading, setIsFaucetLoading] = useState(false);

  // Anvil chain ID is 31337
  const isAnvil = chainId === 31337;

  const handleAnvilFaucet = async () => {
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }

    setIsFaucetLoading(true);

    const result = await fromPromise(
      fetch("/api/faucet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ address }),
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error("Faucet request failed");
        }
        return response.json() as Promise<{ txHash: string }>;
      }),
      (e) => (e instanceof Error ? e : new Error("Unknown error")),
    );

    setIsFaucetLoading(false);

    result.match(
      (data) => {
        toast.success(`Sent 10 ETH to your wallet! TX: ${data.txHash.slice(0, 10)}...`);
      },
      () => {
        toast.error("Failed to send test ETH. Make sure Anvil is running.");
      },
    );
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="container flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <h1 className="font-semibold text-lg">EVM Counters</h1>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/owned-counter"
              className="font-medium text-sm transition-colors hover:text-primary"
            >
              Owned Counter
            </Link>
            <Link
              href="/shared-counter"
              className="font-medium text-sm transition-colors hover:text-primary"
            >
              Shared Counter
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {isAnvil ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAnvilFaucet}
              disabled={isFaucetLoading || !address}
            >
              {isFaucetLoading ? "Sending..." : "Anvil Faucet"}
              <Droplets className="h-3 w-3" />
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <a href="https://sepoliafaucet.com" target="_blank" rel="noopener noreferrer">
                Sepolia Faucet
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          )}
          <ModeToggle />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
