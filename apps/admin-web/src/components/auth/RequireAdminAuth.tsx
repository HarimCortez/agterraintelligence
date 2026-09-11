"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuthStore } from "@/lib/admin-auth-store";

/**
 * Protected-route gate for the admin console — mirrors investor-web's
 * `RequireAuth.tsx` exactly (see that file's doc comment for the
 * hydration-ordering rationale). UX convenience only, not an authorization
 * boundary: the backend's `AdminJwtAuthGuard` (and, for permission-gated
 * screens, `PermissionsGuard`) is what actually enforces access regardless
 * of whether this component ever runs.
 */
export function RequireAdminAuth({ children }: { children: ReactNode }) {
  const hasHydrated = useAdminAuthStore((state) => state.hasHydrated);
  const adminUser = useAdminAuthStore((state) => state.adminUser);
  const router = useRouter();

  useEffect(() => {
    if (hasHydrated && !adminUser) {
      router.replace("/login");
    }
  }, [hasHydrated, adminUser, router]);

  if (!hasHydrated || !adminUser) {
    return (
      <div className="flex min-h-[300px] items-center justify-center p-xl" role="status" aria-live="polite">
        <span className="sr-only">Checking your session…</span>
        <div className="h-8 w-8 animate-pulse rounded-full bg-border-default" aria-hidden="true" />
      </div>
    );
  }

  return <>{children}</>;
}
