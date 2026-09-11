import { RequireAdminAuth } from "@/components/auth/RequireAdminAuth";
import { AuditLogWorkspace } from "@/components/audit/AuditLogWorkspace";

/** `/audit` — protected (see `RequireAdminAuth`); also gated server-side by `audit.read`. */
export default function AuditPage() {
  return (
    <RequireAdminAuth>
      <AuditLogWorkspace />
    </RequireAdminAuth>
  );
}
