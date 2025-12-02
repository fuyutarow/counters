"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { Plus } from "lucide-react";
import { MultiIBSCounterCreate } from "@/components/MultiIBSCounterCreate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function MultiIBSCounterPage() {
  const currentAccount = useCurrentAccount();

  if (!currentAccount) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex h-64 items-center justify-center">
            <h2 className="font-medium text-muted-foreground text-xl">
              Please connect your wallet to use Multi-IBS Counter
            </h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="mb-4 font-bold text-3xl">Multi-IBS Counter</h1>
          <p className="text-muted-foreground">
            Counters secured by threshold Identity-Based Signatures
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            Using Boneh-Franklin IBS with distributed key servers (2-of-3 threshold)
          </p>
        </div>

        {/* Create New Counter */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Multi-IBS Counter
            </CardTitle>
            <CardDescription>
              Deploy a new counter secured by distributed key servers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MultiIBSCounterCreate />
          </CardContent>
        </Card>

        {/* Existing Counters List */}
        <Card>
          <CardHeader>
            <CardTitle>Your Multi-IBS Counters</CardTitle>
            <CardDescription>Manage your existing threshold signature counters</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <p>No Multi-IBS counters found. Create one above to get started.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
