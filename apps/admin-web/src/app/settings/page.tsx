import { RequireAdminAuth } from "@/components/auth/RequireAdminAuth";
import { AdminSettingsWorkspace } from "@/components/settings/AdminSettingsWorkspace";

/** `/settings` — protected (see `RequireAdminAuth`); also gated server-side by `settings.read` (`settings.write` for editing permissions). */
export default function AdminSettingsPage() {
  return (
    <RequireAdminAuth>
      <AdminSettingsWorkspace />
    </RequireAdminAuth>
  );
}
