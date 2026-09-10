"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useComparisonStore } from "@/lib/comparison-store";

/**
 * Persistent comparison-tray indicator — rendered inside the nav rail
 * (`AppShell`) on every page. Deliberate choice on the "hide at 0 vs. show
 * neutral" question the task brief left open: always visible (never
 * conditionally unmounted), so it reads as a stable, discoverable piece of
 * app chrome rather than something that pops in/out of the layout — but at
 * 0 properties it renders as plain muted nav text with no count and no
 * "(0)" badge, matching the visual weight of the other nav rail entries
 * rather than calling attention to an empty state. Once count > 0, it gets
 * the same active/emphasized treatment as an active nav item plus the
 * numeric count, e.g. "Compare (3)".
 */
export function ComparisonTrayIndicator() {
  const count = useComparisonStore((state) => state.propertyIds.length);
  const pathname = usePathname();
  const isActive = pathname === "/compare";

  return (
    <Link
      href="/compare"
      className={`mt-auto flex items-center justify-between rounded px-sm py-sm text-sm transition-colors hover:bg-white/10 ${
        isActive || count > 0 ? "font-semibold text-nav-text" : "text-nav-text-muted"
      }`}
    >
      <span>Compare{count > 0 ? ` (${count})` : ""}</span>
    </Link>
  );
}
