"use client";

import { useEffect, type ReactNode } from "react";
import { AppNavRail } from "@agterra/ui";
import { useAdminAuthStore } from "@/lib/admin-auth-store";
import { AdminNavLinks } from "./AdminNavLinks";
import { AdminAuthNavSection } from "./AdminAuthNavSection";

/**
 * Admin console shell — mirrors investor-web's `AppShell.tsx`. "Overview"
 * and "Billing & Entitlements" are the two real routes so far; the other 7
 * admin modules (Report Fulfillment, Data Sources, Support, Content/Data
 * QA, AI Monitoring, Revenue Analytics, Administration Settings — see
 * REQUIREMENTS.md Section C) aren't built yet.
 */
export function AdminAppShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    void useAdminAuthStore.persist.rehydrate();
  }, []);

  return (
    <div className="flex min-h-screen bg-workspace-bg">
      <AppNavRail items={[]}>
        <AdminNavLinks />
        <AdminAuthNavSection />
      </AppNavRail>

      <main className="flex-1">{children}</main>
    </div>
  );
}
