import { RequireAdminAuth } from "@/components/auth/RequireAdminAuth";
import { SupportWorkspace } from "@/components/support/SupportWorkspace";

/** `/support` — protected (see `RequireAdminAuth`); also gated server-side by `support.read`. */
export default function SupportPage() {
  return (
    <RequireAdminAuth>
      <SupportWorkspace />
    </RequireAdminAuth>
  );
}
