"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Real `<Link>` nav entries — mirrors investor-web's `AuthenticatedNavLinks`
 * pattern (`AppNavRail`'s `items` prop is label/active only, no href
 * support). Now that a second real route exists (`/billing`, alongside
 * `/`), both live here instead of splitting one into `items` and the rest
 * into children.
 */
export function AdminNavLinks() {
  const pathname = usePathname();

  const linkClass = (active: boolean) =>
    `flex items-center rounded px-sm py-sm text-sm transition-colors hover:bg-white/10 ${
      active ? "font-semibold text-nav-text" : "text-nav-text-muted"
    }`;

  return (
    <ul className="flex flex-col gap-xs">
      <li>
        <Link href="/" className={linkClass(pathname === "/")}>
          Overview
        </Link>
      </li>
      <li>
        <Link href="/billing" className={linkClass(pathname === "/billing")}>
          Billing &amp; Entitlements
        </Link>
      </li>
      <li>
        <Link href="/fulfillment" className={linkClass(pathname.startsWith("/fulfillment"))}>
          Report Fulfillment
        </Link>
      </li>
      <li>
        <Link href="/revenue" className={linkClass(pathname === "/revenue")}>
          Revenue Analytics
        </Link>
      </li>
    </ul>
  );
}
