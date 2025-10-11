import { PedersenCounterCreate } from "@/components/PedersenCounterCreate";
import { PedersenCounterList } from "@/components/PedersenCounterList";

export default function PedersenCounterPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-2 text-center">
          <h1 className="font-bold text-3xl">Pedersen Counters</h1>
          <p className="text-muted-foreground">
            Privacy-preserving counters using Pedersen commitments and homomorphic operations
          </p>
        </div>

        <PedersenCounterCreate />

        <div className="space-y-4">
          <h2 className="font-semibold text-2xl">Your Pedersen Counters</h2>
          <PedersenCounterList />
        </div>

        {/* Educational Info */}
        <div className="mx-auto max-w-3xl rounded-lg border bg-card p-6">
          <h3 className="mb-4 font-semibold text-xl">How Pedersen Counters Work</h3>
          <div className="space-y-4 text-muted-foreground text-sm">
            <div>
              <p className="mb-2 font-medium text-foreground">🔐 Cryptographic Commitment</p>
              <p>
                Values are hidden using Pedersen commitments:{" "}
                <code>C = value × G + blinding × H</code>
              </p>
              <p className="mt-1">
                where G and H are generators on the BLS12-381 G1 curve. Only the 48-byte commitment
                is stored on-chain.
              </p>
            </div>

            <div>
              <p className="mb-2 font-medium text-foreground">➕ Homomorphic Addition</p>
              <p>
                Counters can be incremented without revealing values:
                <code className="ml-1">C₁ + C₂ = (v₁ + v₂) × G + (r₁ + r₂) × H</code>
              </p>
              <p className="mt-1">
                This allows mathematical operations on encrypted data while preserving privacy.
              </p>
            </div>

            <div>
              <p className="mb-2 font-medium text-foreground">🛡️ Security Properties</p>
              <ul className="ml-4 list-disc space-y-1">
                <li>
                  <strong>Hiding:</strong> Commitment reveals no information about the value
                </li>
                <li>
                  <strong>Binding:</strong> Cannot change the committed value after creation
                </li>
                <li>
                  <strong>Homomorphic:</strong> Supports addition without decryption
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-2 font-medium text-foreground">💡 Use Cases</p>
              <ul className="ml-4 list-disc space-y-1">
                <li>Private voting systems with verifiable tallies</li>
                <li>Confidential transaction amounts (like Mimblewimble)</li>
                <li>Privacy-preserving auctions and sealed-bid protocols</li>
                <li>Anonymous reputation systems</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
