import { RequireAdminAuth } from "@/components/auth/RequireAdminAuth";
import { AiMonitoringWorkspace } from "@/components/ai-monitoring/AiMonitoringWorkspace";

/** `/ai-monitoring` — protected (see `RequireAdminAuth`); also gated server-side by `ai_monitoring.read`. */
export default function AiMonitoringPage() {
  return (
    <RequireAdminAuth>
      <AiMonitoringWorkspace />
    </RequireAdminAuth>
  );
}
