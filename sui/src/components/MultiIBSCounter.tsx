"use client";

import { Key, MessageSquare, Server, Shield } from "lucide-react";
import { useId, useState } from "react";
import { CounterDisplay } from "@/components/CounterDisplay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useMultiIBSCounter, useMultiIBSCounterValue } from "@/hooks/useMultiIBSCounter";

interface MultiIBSCounterProps {
  id: string;
}

export function MultiIBSCounter({ id }: MultiIBSCounterProps) {
  const counter = useMultiIBSCounter();
  const { data, isLoading, error, refetch } = useMultiIBSCounterValue(id);
  const [message, setMessage] = useState("");
  const [isSigningProcess, setIsSigningProcess] = useState(false);
  const messageInputId = useId();

  const handleSignAndIncrement = async () => {
    if (!message.trim()) {
      return;
    }

    try {
      setIsSigningProcess(true);
      await counter.signAndIncrement({ counterId: id, message: message.trim() });
      setMessage("");
      refetch();
    } catch (_error) {
    } finally {
      setIsSigningProcess(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="py-8 text-center">
          <p className="text-red-700">
            Failed to load Multi-IBS counter. Please check the counter ID and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Counter Display */}
      <CounterDisplay
        id={id}
        title="Multi-IBS Counter"
        value={data.value}
        isLoading={false}
        isIncrementing={false}
        isSettingValue={false}
        onIncrement={() => {}} // Not used for Multi-IBS
        onSetValue={() => {}} // Not used for Multi-IBS
        error={null}
      />

      {/* Key Server Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Key Server Status
          </CardTitle>
          <CardDescription>
            Threshold signature scheme ({counter.threshold}-of-{counter.keyServers.length})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {counter.keyServers.map((server, _index) => (
              <div
                key={server.objectId}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-green-500" />
                  <span className="font-medium text-sm">{server.name}</span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  Active
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Multi-IBS Signature Interface */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Multi-IBS Signature & Increment
          </CardTitle>
          <CardDescription>
            Generate a threshold signature and increment the counter
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Message Input */}
          <div className="space-y-2">
            <Label htmlFor={messageInputId} className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Message to Sign
            </Label>
            <Input
              id={messageInputId}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter a message to create IBE identity..."
              disabled={isSigningProcess || counter.isPending.signAndIncrement}
            />
            <p className="text-muted-foreground text-xs">
              This message will be used to create the IBE identity for signature generation
            </p>
          </div>

          {/* Action Button */}
          <Button
            onClick={handleSignAndIncrement}
            disabled={!message.trim() || isSigningProcess || counter.isPending.signAndIncrement}
            className="w-full gap-2"
            size="lg"
          >
            {isSigningProcess || counter.isPending.signAndIncrement ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Generating Signature...
              </>
            ) : (
              <>
                <Shield className="h-4 w-4" />
                Sign & Increment Counter
              </>
            )}
          </Button>

          {/* Process Description */}
          <div className="rounded-lg bg-muted/50 p-4 text-sm">
            <h4 className="mb-2 font-medium">Signature Process:</h4>
            <ol className="space-y-1 text-muted-foreground">
              <li>1. Request IBE key shares from {counter.threshold} key servers</li>
              <li>2. Aggregate secret keys using Lagrange interpolation</li>
              <li>3. Generate BLS signature for the given message</li>
              <li>4. Verify signature on-chain using pairing operations</li>
              <li>5. Increment counter upon successful verification</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
