import { WalrusCounter } from "@/components/WalrusCounter";

export const runtime = "nodejs";

export default async function WalrusCounterObject({
  params,
}: {
  params: Promise<{ objectId: string }>;
}) {
  const { objectId } = await params;

  if (!objectId) {
    return <div>Invalid counter ID</div>;
  }

  return <WalrusCounter id={objectId} />;
}
