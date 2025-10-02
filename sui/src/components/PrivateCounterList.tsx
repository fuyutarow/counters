"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { usePrivateCounter } from "@/hooks/usePrivateCounter";
import { PrivateCounter } from "./PrivateCounter";

export function PrivateCounterList() {
  const { getStoredCounterIds } = usePrivateCounter();
  const [counterIds, setCounterIds] = useState<string[]>([]);

  useEffect(() => {
    // Load counter IDs from localStorage
    const ids = getStoredCounterIds();
    setCounterIds(ids);
  }, [getStoredCounterIds]);

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
      {counterIds.map((id) => (
        <PrivateCounter key={id} id={id} />
      ))}
    </div>
  );
}
