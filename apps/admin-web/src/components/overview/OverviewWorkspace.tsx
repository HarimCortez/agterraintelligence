"use client";

import Link from "next/link";
import { useAdminAuthStore } from "@/lib/admin-auth-store";

/**
 * Minimal first Overview screen — proves the admin auth plane works
 * end-to-end and shows the logged-in admin's identity/role. Deliberately
 * not the full "Admin Console Overview" from REQUIREMENTS.md Section C
 * (users/revenue/system-health KPIs, recent activity, etc.) — that needs
 * new backend aggregate-query endpoints that don't exist yet, which is
 * real follow-up scope, not something to fake with placeholder numbers.
 */
export function OverviewWorkspace() {
  const adminUser = useAdminAuthStore((state) => state.adminUser);

  return (
    <div className="p-xl">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text-primary">Overview</h1>
        <p className="text-sm text-text-secondary">
          Logged in as {adminUser?.email} ({adminUser?.internalRole.replace(/_/g, " ")})
        </p>
      </header>

      <div className="rounded border border-border-subtle bg-surface p-lg text-sm text-text-secondary">
        <Link href="/billing" className="text-action-primary underline">
          Billing &amp; Entitlements
        </Link>
        ,{" "}
        <Link href="/fulfillment" className="text-action-primary underline">
          Report Fulfillment
        </Link>
        ,{" "}
        <Link href="/revenue" className="text-action-primary underline">
          Revenue Analytics
        </Link>
        , and{" "}
        <Link href="/audit" className="text-action-primary underline">
          Audit Log
        </Link>{" "}
        are live. The rest of the admin console — data-source monitoring, support, content/data QA, AI
        monitoring, and settings — is built in later passes.
      </div>
    </div>
  );
}
