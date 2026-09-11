"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdminAuthStore } from "@/lib/admin-auth-store";

/** Mirrors investor-web's `AuthNavSection.tsx` — see that file's doc comment. */
export function AdminAuthNavSection() {
  const adminUser = useAdminAuthStore((state) => state.adminUser);
  const logout = useAdminAuthStore((state) => state.logout);
  const router = useRouter();

  if (!adminUser) {
    return (
      <Link
        href="/login"
        className="mt-sm flex items-center rounded px-sm py-sm text-sm text-nav-text-muted transition-colors hover:bg-white/10 hover:text-nav-text"
      >
        Log in
      </Link>
    );
  }

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <div className="mt-sm flex flex-col gap-xs px-sm py-sm text-sm">
      <span className="truncate text-nav-text-muted" title={adminUser.email}>
        {adminUser.email}
      </span>
      <span className="text-xs text-nav-text-muted">{adminUser.internalRole.replace(/_/g, " ")}</span>
      <button
        type="button"
        onClick={handleLogout}
        className="self-start text-nav-text-muted underline hover:text-nav-text"
      >
        Log out
      </button>
    </div>
  );
}
