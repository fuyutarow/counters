"use client";

import { formatAddress } from "@mysten/sui/utils";
import { Copy, Database, ExternalLink, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWalrusCounterList } from "@/hooks/queries/useWalrusCounterList";

export function WalrusCounterList() {
  const router = useRouter();

  const { data: walrusCounters = [], isLoading } = useWalrusCounterList();

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (walrusCounters.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Database className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="mb-2 font-medium text-lg text-muted-foreground">No Walrus counters found</p>
          <p className="text-muted-foreground text-sm">
            Create your first Walrus counter to get started
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-xl">Your Walrus Counters ({walrusCounters.length})</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {walrusCounters.map((counter) => (
          <Card key={counter.id} className="transition-shadow hover:shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Database className="h-5 w-5" />
                    Walrus Counter
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    <code className="font-mono text-muted-foreground text-xs">
                      {formatAddress(counter.id)}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0"
                      onClick={() => copyToClipboard(counter.id)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="rounded-md bg-muted/50 p-2">
                <p className="text-muted-foreground text-xs">Blob ID</p>
                <div className="flex items-center justify-between">
                  <code className="font-mono text-xs">{formatAddress(counter.blobId)}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => copyToClipboard(counter.blobId)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/walrus-counter/${counter.id}`)}
                className="flex w-full items-center justify-center space-x-1"
              >
                <span>Open</span>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
