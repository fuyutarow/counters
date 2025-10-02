"use client";

import { formatAddress } from "@mysten/sui/utils";
import { Copy, ExternalLink, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePrivateCounter } from "@/hooks/usePrivateCounter";

export function PrivateCounterList() {
  const router = useRouter();
  const { getLocalCounterState } = usePrivateCounter();
  const [counterIds, setCounterIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("privateCounters");
      if (!stored) {
        setCounterIds([]);
        return;
      }
      const data = JSON.parse(stored);
      setCounterIds(Object.keys(data));
    } catch {
      setCounterIds([]);
    }
  }, []);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  if (counterIds.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <p>No private counters found.</p>
          <p className="mt-2 text-sm">Create your first private counter above!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-xl">Your Private Counters ({counterIds.length})</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {counterIds.map((id) => {
          const localState = getLocalCounterState(id);
          return (
            <Card key={id} className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Shield className="h-4 w-4" />
                      Private Counter
                    </CardTitle>
                    <div className="flex items-center space-x-2">
                      <code className="font-mono text-muted-foreground text-xs">
                        {formatAddress(id)}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0"
                        onClick={() => copyToClipboard(id)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {localState && (
                    <Badge variant="secondary" className="px-3 py-1 font-bold text-2xl">
                      {localState.value.toString()}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground text-sm">
                    {localState ? "Value hidden on-chain" : "No local secrets"}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/private-counter/${id}`)}
                    className="flex items-center space-x-1"
                  >
                    <span>Open</span>
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
