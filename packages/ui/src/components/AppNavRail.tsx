import type { ReactNode } from "react";

export interface AppNavItem {
  label: string;
  active?: boolean;
}

export interface AppNavRailProps {
  items: AppNavItem[];
  children?: ReactNode;
  /**
   * Optional href for the "AgTerra Intelligence" wordmark. Plain `<a>`
   * (not `next/link`) since this package has no framework dependency —
   * a full navigation is an acceptable tradeoff for a logo click. Omit to
   * render the wordmark as inert text (e.g. on a screen with no real home
   * route yet, as admin-web's shell currently does).
   */
  logoHref?: string;
}

/**
 * Fixed dark nav rail — DESIGN-SYSTEM.md's "app shell" scope: a fixed dark
 * surface across all contexts, not a theme toggle. Only the Discover
 * workspace exists as a real route so far; `items` intentionally isn't
 * pre-populated with the other 9 investor screens here (that's `pm`/`ux`
 * scope to define navigation IA for, not something to invent in `fe`) —
 * callers pass whatever items are real.
 */
export function AppNavRail({ items, children, logoHref }: AppNavRailProps) {
  const logo = (
    <span className="text-lg font-semibold text-nav-text">AgTerra Intelligence</span>
  );

  return (
    <nav className="flex w-[220px] shrink-0 flex-col bg-nav-bg px-lg py-xl">
      <div className="mb-2xl">
        {logoHref ? (
          <a href={logoHref} className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nav-text">
            {logo}
          </a>
        ) : (
          logo
        )}
      </div>
      <ul className="flex flex-col gap-xs">
        {items.map((item) => (
          <li key={item.label}>
            <span
              className={`block rounded px-sm py-sm text-sm ${
                item.active ? "font-semibold text-nav-text" : "text-nav-text-muted"
              }`}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
      {children}
    </nav>
  );
}
