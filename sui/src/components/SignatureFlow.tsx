"use client";

import { AlertTriangle, ArrowRight, CheckCircle, Key } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface SignatureStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "active" | "completed" | "failed";
  details?: string;
}

interface SignatureFlowProps {
  isActive: boolean;
  onComplete?: () => void;
  onReset?: () => void;
}

export function SignatureFlow({ isActive, onComplete, onReset }: SignatureFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps: SignatureStep[] = [
    {
      id: "request",
      title: "Request Key Shares",
      description: "Requesting IBE key shares from distributed key servers",
      status: currentStep === 0 ? "active" : currentStep > 0 ? "completed" : "pending",
    },
    {
      id: "aggregate",
      title: "Aggregate Keys",
      description: "Combining key shares using Lagrange interpolation",
      status: currentStep === 1 ? "active" : currentStep > 1 ? "completed" : "pending",
    },
    {
      id: "sign",
      title: "Generate Signature",
      description: "Creating BLS signature for the message",
      status: currentStep === 2 ? "active" : currentStep > 2 ? "completed" : "pending",
    },
    {
      id: "verify",
      title: "Verify On-Chain",
      description: "Verifying signature using pairing operations",
      status: currentStep === 3 ? "active" : currentStep > 3 ? "completed" : "pending",
    },
    {
      id: "increment",
      title: "Increment Counter",
      description: "Updating counter value upon successful verification",
      status: currentStep === 4 ? "active" : currentStep > 4 ? "completed" : "pending",
    },
  ];

  const getBadgeVariant = (status: SignatureStep["status"]) => {
    if (status === "completed") return "default";
    if (status === "active") return "secondary";
    if (status === "failed") return "destructive";
    return "outline";
  };

  const getStepIcon = (status: SignatureStep["status"]) => {
    switch (status) {
      case "pending":
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-gray-300 text-gray-400 text-sm">
            •
          </div>
        );
      case "active":
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-blue-500 bg-blue-50">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        );
      case "completed":
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white">
            <CheckCircle className="h-5 w-5" />
          </div>
        );
      case "failed":
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white">
            <AlertTriangle className="h-5 w-5" />
          </div>
        );
    }
  };

  const simulateNextStep = () => {
    if (currentStep < steps.length - 1) {
      setTimeout(() => {
        setCurrentStep((prev) => prev + 1);
      }, 2000);
    } else if (onComplete) {
      setTimeout(() => {
        onComplete();
      }, 1000);
    }
  };

  const handleReset = () => {
    setCurrentStep(0);
    if (onReset) {
      onReset();
    }
  };

  if (!isActive) {
    return null;
  }

  return (
    <Card className="border-2 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
          <Key className="h-5 w-5" />
          Multi-IBS Signature Process
        </CardTitle>
        <CardDescription className="text-blue-700 dark:text-blue-300">
          Generating threshold signature using distributed key servers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Steps Flow */}
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={step.id}>
              <div className="flex items-start gap-4">
                {getStepIcon(step.status)}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm">{step.title}</h4>
                    <Badge variant={getBadgeVariant(step.status)} className="text-xs">
                      {step.status}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">{step.description}</p>
                  {step.details && (
                    <p className="text-blue-600 text-xs dark:text-blue-400">{step.details}</p>
                  )}
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className="mt-2 ml-4 h-4 w-px bg-gray-200 dark:bg-gray-700" />
              )}
            </div>
          ))}
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex justify-between">
          <Button variant="outline" size="sm" onClick={handleReset}>
            Reset Process
          </Button>

          {currentStep < steps.length - 1 && (
            <Button size="sm" onClick={simulateNextStep} className="gap-2">
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}

          {currentStep === steps.length - 1 && (
            <Badge variant="default" className="gap-2">
              <CheckCircle className="h-4 w-4" />
              Process Complete
            </Badge>
          )}
        </div>

        {/* Technical Details */}
        <div className="rounded-lg bg-white/50 p-3 text-xs dark:bg-gray-900/50">
          <h5 className="mb-2 font-medium">Technical Process:</h5>
          <ul className="space-y-1 text-muted-foreground">
            <li>• IBE Identity: counter_id || signer || domain || message</li>
            <li>• Key Derivation: H₁(FullID) using BLS12-381 curve</li>
            <li>• Threshold: 2-of-3 Lagrange interpolation</li>
            <li>• Verification: e(σ, G₂) = e(H₁(ID), PK_agg)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
