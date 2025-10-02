import { PrivateCounterCreate } from "@/components/PrivateCounterCreate";
import { PrivateCounterList } from "@/components/PrivateCounterList";

export default function PrivateCounterPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-2 text-center">
          <h1 className="font-bold text-3xl">Private Counters</h1>
          <p className="text-muted-foreground">
            Create and manage private counters with zero-knowledge proofs
          </p>
        </div>

        <PrivateCounterCreate />

        <div className="space-y-4">
          <h2 className="font-semibold text-2xl">Your Private Counters</h2>
          <PrivateCounterList />
        </div>
      </div>
    </div>
  );
}
