"use client";

import { buildPoseidon } from "circomlibjs";
import { Loader2, Shield } from "lucide-react";
import { ResultAsync } from "neverthrow";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useZkProver } from "@/hooks/useZkProver";

export function PrivateCounterProver() {
  const saltId = useId();
  const oldValueId = useId();
  const oldRandomnessId = useId();
  const newRandomnessId = useId();

  const [salt, setSalt] = useState("12345");
  const [oldValue, setOldValue] = useState("0");
  const [oldRandomness, setOldRandomness] = useState("987654321");
  const [newRandomness, setNewRandomness] = useState("123456789");

  const [result, setResult] = useState<{
    newHash: string;
    newValue: string;
    proofHex: string;
    publicInputsHex: string;
  } | null>(null);

  const { mutateAsync: generateProof, isPending } = useZkProver();

  const handleGenerateProof = async () => {
    const result = await ResultAsync.fromPromise(
      (async () => {
        // Convert inputs to bigint
        const saltBigInt = BigInt(salt);
        const oldValueBigInt = BigInt(oldValue);
        const oldRandomnessBigInt = BigInt(oldRandomness);
        const newRandomnessBigInt = BigInt(newRandomness);

        // Compute hashes
        const poseidon = await buildPoseidon();
        const F = poseidon.F;

        const saltHash = BigInt(F.toString(poseidon([saltBigInt])));
        const oldHash = BigInt(F.toString(poseidon([oldValueBigInt, oldRandomnessBigInt])));

        // Generate proof
        const proofResult = await generateProof({
          salt: saltBigInt,
          oldValue: oldValueBigInt,
          oldRandomness: oldRandomnessBigInt,
          newRandomness: newRandomnessBigInt,
          saltHash,
          oldHash,
        });

        // Convert to hex for display
        const proofHex = Array.from(proofResult.proofBytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const publicInputsHex = Array.from(proofResult.publicInputsBytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        return {
          newHash: proofResult.newHash.toString(),
          newValue: proofResult.newValue.toString(),
          proofHex,
          publicInputsHex,
        };
      })(),
      (error) => (error instanceof Error ? error.message : "Unknown error"),
    );

    result.match(
      (data) => {
        setResult(data);
        toast.success("ZK Proof generated successfully!", {
          description: `New value: ${data.newValue}`,
        });
      },
      (errorMsg) => {
        toast.error("Failed to generate proof", {
          description: errorMsg,
        });
      },
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Private Counter ZK Prover</CardTitle>
          </div>
          <CardDescription>
            Generate zero-knowledge proofs for private counter increments (+1 only)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor={saltId}>Salt (Private)</Label>
              <Input
                id={saltId}
                type="text"
                value={salt}
                onChange={(e) => setSalt(e.target.value)}
                placeholder="12345"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={oldValueId}>Current Value (Private)</Label>
              <Input
                id={oldValueId}
                type="text"
                value={oldValue}
                onChange={(e) => setOldValue(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={oldRandomnessId}>Current Randomness (Private)</Label>
              <Input
                id={oldRandomnessId}
                type="text"
                value={oldRandomness}
                onChange={(e) => setOldRandomness(e.target.value)}
                placeholder="987654321"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={newRandomnessId}>New Randomness (Private)</Label>
              <Input
                id={newRandomnessId}
                type="text"
                value={newRandomness}
                onChange={(e) => setNewRandomness(e.target.value)}
                placeholder="123456789"
              />
            </div>
          </div>

          <Button onClick={handleGenerateProof} disabled={isPending} className="w-full">
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Proof...
              </>
            ) : (
              "Generate ZK Proof"
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Proof Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>New Value</Label>
              <div className="rounded bg-muted p-2 font-mono text-sm">{result.newValue}</div>
            </div>

            <div className="space-y-2">
              <Label>New Hash</Label>
              <div className="break-all rounded bg-muted p-2 font-mono text-sm">
                {result.newHash}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Proof Bytes (128 bytes, hex)</Label>
              <div className="max-h-24 overflow-auto break-all rounded bg-muted p-2 font-mono text-xs">
                {result.proofHex}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Public Inputs (96 bytes, hex)</Label>
              <div className="max-h-24 overflow-auto break-all rounded bg-muted p-2 font-mono text-xs">
                {result.publicInputsHex}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
