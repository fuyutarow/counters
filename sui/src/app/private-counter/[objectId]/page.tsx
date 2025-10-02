import { PrivateCounter } from "@/components/PrivateCounter";

export default async function PrivateCounterObject({
  params,
}: {
  params: Promise<{ objectId: string }>;
}) {
  const { objectId } = await params;

  if (!objectId) {
    return <div>Invalid counter ID</div>;
  }

  return <PrivateCounter id={objectId} />;
}
