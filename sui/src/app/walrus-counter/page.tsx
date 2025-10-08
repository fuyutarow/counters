import { WalrusCounterCreate } from "@/components/WalrusCounterCreate";
import { WalrusCounterList } from "@/components/WalrusCounterList";

export const runtime = "nodejs";

export default function WalrusCounterPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-2 text-center">
          <h1 className="font-bold text-3xl">Walrus Counters</h1>
          <p className="text-muted-foreground">
            Counters with decentralized blob storage on Walrus
          </p>
        </div>

        <WalrusCounterCreate />

        <div className="space-y-4">
          <h2 className="font-semibold text-2xl">Your Walrus Counters</h2>
          <WalrusCounterList />
        </div>
      </div>
    </div>
  );
}
