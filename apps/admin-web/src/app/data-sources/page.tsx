import { RequireAdminAuth } from "@/components/auth/RequireAdminAuth";
import { IngestionWorkspace } from "@/components/ingestion/IngestionWorkspace";

/** `/data-sources` — protected (see `RequireAdminAuth`); also gated server-side by `ingestion.read`/`ingestion.run`. */
export default function DataSourcesPage() {
  return (
    <RequireAdminAuth>
      <IngestionWorkspace />
    </RequireAdminAuth>
  );
}
