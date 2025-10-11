"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { SuiWalletConnectButton } from "@/components/wallet/SuiWalletConnectButton";

export function AppBar() {
  // Faucet + Wallet connect only

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <h1 className="font-semibold text-lg">Sui Counters</h1>
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
            <Link
              href="/private-counter"
              className="font-medium text-sm transition-colors hover:text-primary"
            >
              Private Counter
            </Link>
            <Link
              href="/walrus-counter"
              className="font-medium text-sm transition-colors hover:text-primary"
            >
              Walrus Counter
            </Link>
            <Link
              href="/pedersen-counter"
              className="font-medium text-sm transition-colors hover:text-primary"
            >
              Pedersen Counter
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://faucet.sui.io/?network=testnet"
              target="_blank"
              rel="noopener noreferrer"
            >
              Faucet
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
          <ModeToggle />
          <SuiWalletConnectButton />
        </div>
      </div>
    </header>
  );
}
