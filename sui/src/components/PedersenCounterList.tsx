"use client";

import { formatAddress } from "@mysten/sui/utils";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePedersenCounterList } from "@/hooks/queries/usePedersenCounterList";

export function PedersenCounterList() {
  const router = useRouter();

  const { data: pedersenCounters = [], isLoading } = usePedersenCounterList();

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  function formatCommitment(bytes: number[]): string {
    // Show first 8 bytes in hex
    return bytes
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (pedersenCounters.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <p className="mb-2 font-medium text-lg text-muted-foreground">
            No Pedersen counters found
          </p>
          <p className="text-muted-foreground text-sm">
            Create your first Pedersen counter to get started
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-xl">Your Pedersen Counters ({pedersenCounters.length})</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pedersenCounters.map((counter) => (
          <Card key={counter.id} className="transition-shadow hover:shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <CardTitle className="text-lg">Pedersen Counter</CardTitle>
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
                <Badge variant="secondary" className="font-mono text-xs">
                  🔐 Hidden
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs">Commitment (48 bytes):</div>
                <code className="block break-all rounded bg-muted p-2 font-mono text-xs">
                  {formatCommitment(counter.commitmentBytes)}...
                </code>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-muted-foreground text-sm">Version: {counter.version}</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/pedersen-counter/${counter.id}`)}
                  className="flex items-center space-x-1"
                >
                  <span>Open</span>
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
