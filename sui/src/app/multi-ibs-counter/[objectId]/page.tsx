"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { MultiIBSCounter } from "@/components/MultiIBSCounter";
import { Button } from "@/components/ui/button";

interface MultiIBSCounterPageProps {
  params: {
    objectId: string;
  };
}

export default function MultiIBSCounterDetailPage({ params }: MultiIBSCounterPageProps) {
  const currentAccount = useCurrentAccount();

  if (!currentAccount) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex h-64 items-center justify-center">
            <h2 className="font-medium text-muted-foreground text-xl">
              Please connect your wallet to view this Multi-IBS Counter
            </h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Back Button */}
        <Button asChild variant="ghost" className="gap-2">
          <Link href="/multi-ibs-counter">
            <ArrowLeft className="h-4 w-4" />
            Back to Multi-IBS Counters
          </Link>
        </Button>

        {/* Counter Component */}
        <MultiIBSCounter id={params.objectId} />
      </div>
    </div>
  );
}
