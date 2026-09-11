import { RequireAdminAuth } from "@/components/auth/RequireAdminAuth";
import { DataQualityPropertyDetail } from "@/components/data-quality/DataQualityPropertyDetail";

/** `/data-quality/:id` — protected; also gated server-side by `data_quality.read` (`data_quality.verify` for the verify action). */
export default function DataQualityPropertyPage({ params }: { params: { id: string } }) {
  return (
    <RequireAdminAuth>
      <DataQualityPropertyDetail propertyId={params.id} />
    </RequireAdminAuth>
  );
}
