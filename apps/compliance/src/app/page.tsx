import { AccessCheck } from "@/components/layout/access-check";
import { BffStatus } from "@/components/layout/bff-status";
import { PageHeader } from "@/components/layout/app-shell";
import { surface } from "@/lib/surface";

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader
        title={surface.product}
        description={`${surface.team} surface. Screens are built under src/features/ and fetch only from the paired BFF.`}
      />
      <BffStatus />
      <AccessCheck />
    </div>
  );
}
