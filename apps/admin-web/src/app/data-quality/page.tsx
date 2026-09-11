import { RequireAdminAuth } from "@/components/auth/RequireAdminAuth";
import { DataQualityWorkspace } from "@/components/data-quality/DataQualityWorkspace";

/** `/data-quality` — protected (see `RequireAdminAuth`); also gated server-side by `data_quality.read`. */
export default function DataQualityPage() {
  return (
    <RequireAdminAuth>
      <DataQualityWorkspace />
    </RequireAdminAuth>
  );
}
