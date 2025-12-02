"use client";

import { AlertCircle, CheckCircle, Clock, Key, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface KeyServerInfo {
  id: string;
  name: string;
  objectId: string;
  status: "pending" | "responding" | "success" | "failed";
  responseTime?: number;
  errorMessage?: string;
}

interface KeyServerStatusProps {
  servers: KeyServerInfo[];
  threshold: number;
  currentShares: number;
}

export function KeyServerStatus({ servers, threshold, currentShares }: KeyServerStatusProps) {
  const successCount = servers.filter((s) => s.status === "success").length;
  const failedCount = servers.filter((s) => s.status === "failed").length;
  const pendingCount = servers.filter(
    (s) => s.status === "pending" || s.status === "responding",
  ).length;

  const getStatusIcon = (status: KeyServerInfo["status"]) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-gray-500" />;
      case "responding":
        return (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        );
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: KeyServerInfo["status"]) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "responding":
        return (
          <Badge variant="outline" className="border-blue-500 text-blue-600">
            Responding
          </Badge>
        );
      case "success":
        return (
          <Badge variant="outline" className="border-green-500 text-green-600">
            Success
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="outline" className="border-red-500 text-red-600">
            Failed
          </Badge>
        );
    }
  };

  const progressPercentage = (currentShares / threshold) * 100;
  const isThresholdMet = currentShares >= threshold;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Key Server Status
          <Badge variant={isThresholdMet ? "default" : "secondary"}>
            {currentShares}/{threshold} Required
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Threshold Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Threshold Progress</span>
            <span className={isThresholdMet ? "text-green-600" : "text-muted-foreground"}>
              {currentShares}/{threshold} shares
            </span>
          </div>
          <Progress
            value={progressPercentage}
            className={`h-2 ${isThresholdMet ? "bg-green-100" : ""}`}
          />
          {isThresholdMet && (
            <p className="font-medium text-green-600 text-sm">
              ✓ Threshold met! Ready to generate signature.
            </p>
          )}
        </div>

        {/* Server Status List */}
        <div className="space-y-3">
          {servers.map((server) => (
            <div
              key={server.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                {getStatusIcon(server.status)}
                <div>
                  <p className="font-medium text-sm">{server.name}</p>
                  <p className="font-mono text-muted-foreground text-xs">
                    {server.objectId.slice(0, 8)}...{server.objectId.slice(-6)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {server.responseTime && (
                  <span className="text-muted-foreground text-xs">{server.responseTime}ms</span>
                )}
                {getStatusBadge(server.status)}
              </div>
            </div>
          ))}
        </div>

        {/* Summary Stats */}
        <div className="flex justify-between rounded-lg bg-muted/50 p-3 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span>{successCount} successful</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            <span>{pendingCount} pending</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <span>{failedCount} failed</span>
          </div>
        </div>

        {/* Error Messages */}
        {servers.some((s) => s.status === "failed" && s.errorMessage) && (
          <div className="space-y-2">
            <p className="font-medium text-red-600 text-sm">Errors:</p>
            {servers
              .filter((s) => s.status === "failed" && s.errorMessage)
              .map((server) => (
                <div key={server.id} className="rounded bg-red-50 p-2 text-red-700 text-xs">
                  <strong>{server.name}:</strong> {server.errorMessage}
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
