"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { ArrowRight, Database, Lock, Package, Shield } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  const currentAccount = useCurrentAccount();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-6xl rounded-lg bg-muted/50">
        {!currentAccount ? (
          <div className="flex h-64 items-center justify-center">
            <h2 className="font-medium text-muted-foreground text-xl">
              Please connect your wallet
            </h2>
          </div>
        ) : (
          <div className="flex min-h-[500px] flex-col items-center justify-center p-8">
            <div className="w-full max-w-4xl space-y-8">
              <div className="mb-12 text-center">
                <h1 className="mb-4 font-bold text-4xl">Welcome to Sui Counters</h1>
                <p className="text-muted-foreground text-xl">Choose your counter demo</p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card className="transition-shadow hover:shadow-lg">
                  <CardHeader>
                    <div className="mb-2 flex items-center gap-3">
                      <Package className="h-8 w-8 text-primary" />
                      <CardTitle>Owned Counter</CardTitle>
                    </div>
                    <CardDescription>A counter that only the owner can modify</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="mb-4 space-y-2 text-muted-foreground text-sm">
                      <li>• Owner-only increment</li>
                      <li>• Owner-only set value</li>
                      <li>• Personal counter</li>
                    </ul>
                    <Button asChild className="w-full" variant="outline">
                      <Link href="/owned-counter">
                        Try Owned Counter
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>

                <Card className="transition-shadow hover:shadow-lg">
                  <CardHeader>
                    <div className="mb-2 flex items-center gap-3">
                      <Lock className="h-8 w-8 text-primary" />
                      <CardTitle>Shared Counter</CardTitle>
                    </div>
                    <CardDescription>
                      A counter that anyone can increment, owner can set value
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="mb-4 space-y-2 text-muted-foreground text-sm">
                      <li>• Anyone can increment</li>
                      <li>• Owner can set value</li>
                      <li>• Shared collaboration</li>
                    </ul>
                    <Button asChild className="w-full" variant="outline">
                      <Link href="/shared-counter">
                        Try Shared Counter
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>

                <Card className="transition-shadow hover:shadow-lg">
                  <CardHeader>
                    <div className="mb-2 flex items-center gap-3">
                      <Database className="h-8 w-8 text-primary" />
                      <CardTitle>Walrus Counter</CardTitle>
                    </div>
                    <CardDescription>Counter with blob storage on Walrus</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="mb-4 space-y-2 text-muted-foreground text-sm">
                      <li>• Off-chain storage</li>
                      <li>• Blob-based data</li>
                      <li>• Decentralized counter</li>
                    </ul>
                    <Button asChild className="w-full" variant="outline">
                      <Link href="/walrus-counter">
                        Try Walrus Counter
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>

                <Card className="transition-shadow hover:shadow-lg">
                  <CardHeader>
                    <div className="mb-2 flex items-center gap-3">
                      <Shield className="h-8 w-8 text-primary" />
                      <CardTitle>Pedersen Counter</CardTitle>
                    </div>
                    <CardDescription>
                      Privacy-preserving counter using cryptographic commitments
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="mb-4 space-y-2 text-muted-foreground text-sm">
                      <li>• Hidden values (commitments)</li>
                      <li>• Homomorphic operations</li>
                      <li>• Cryptographic privacy</li>
                    </ul>
                    <Button asChild className="w-full" variant="outline">
                      <Link href="/pedersen-counter">
                        Try Pedersen Counter
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
