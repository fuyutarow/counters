import { PedersenCounter } from "@/components/PedersenCounter";

export default async function PedersenCounterObject({
  params,
}: {
  params: Promise<{ objectId: string }>;
}) {
  const { objectId } = await params;

  if (!objectId) {
    return <div>Invalid counter ID</div>;
  }

  return <PedersenCounter id={objectId} />;
}
