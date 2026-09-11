"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppNavRail } from "@agterra/ui";
import { useAdminAuthStore } from "@/lib/admin-auth-store";
import { AdminAuthNavSection } from "./AdminAuthNavSection";

/**
 * Admin console shell — mirrors investor-web's `AppShell.tsx`. Only
 * "Overview" exists as a real route so far; the other 8 admin modules
 * (Billing/Entitlements, Report Fulfillment, Data Sources, Support,
 * Content/Data QA, AI Monitoring, Revenue Analytics, Administration
 * Settings — see REQUIREMENTS.md Section C) aren't built yet, so `items`
 * isn't pre-populated with routes that don't exist.
 */
export function AdminAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    void useAdminAuthStore.persist.rehydrate();
  }, []);

  const items = [{ label: "Overview", active: pathname === "/" }];

  return (
    <div className="flex min-h-screen bg-workspace-bg">
      <AppNavRail items={items}>
        <AdminAuthNavSection />
      </AppNavRail>

      <main className="flex-1">{children}</main>
    </div>
  );
}
