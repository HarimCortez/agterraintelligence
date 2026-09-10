/**
 * Minimal inline SVG icon set for the Discover + Map Workspace badges
 * (Opportunity Score band icons, risk flag icons, data-confidence icons).
 *
 * No icon-library dependency exists in ARCHITECTURE.md's stack table, so
 * these are hand-rolled, single-purpose glyphs rather than pulling in a new
 * package for ~10 small icons. Every icon is `aria-hidden` — per
 * DESIGN-SYSTEM.md, icons *supplement* the mandatory label text, they never
 * replace it, so the icon itself carries no independent accessible name.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 12,
  height: 12,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
  focusable: false,
} as const;

export function StarFilledIcon(props: IconProps) {
  return (
    <svg {...base} {...props} fill="currentColor" stroke="none">
      <path d="M12 2l2.9 6.26 6.9.6-5.2 4.6 1.6 6.79L12 16.9l-6.2 3.35 1.6-6.79-5.2-4.6 6.9-.6L12 2z" />
    </svg>
  );
}

export function ChevronUpFilledIcon(props: IconProps) {
  return (
    <svg {...base} {...props} fill="currentColor" stroke="none">
      <path d="M12 6l8 10H4z" />
    </svg>
  );
}

export function ChevronUpOutlineIcon(props: IconProps) {
  return (
    <svg {...base} {...props} fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M5 16l7-8 7 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...base} {...props} fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <svg {...base} {...props} fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function FlagOutlineIcon(props: IconProps) {
  return (
    <svg {...base} {...props} fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M5 3v18" strokeLinecap="round" />
      <path d="M5 4h11l-2.5 3.5L16 11H5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FlagFilledIcon(props: IconProps) {
  return (
    <svg {...base} {...props} fill="currentColor" stroke="none">
      <path d="M6 2a1 1 0 00-1 1v19h2v-6h10.5a1 1 0 00.8-1.6L15 9l3.3-5.4A1 1 0 0017.5 2H6z" />
    </svg>
  );
}

export function ExclamationTriangleIcon(props: IconProps) {
  return (
    <svg {...base} {...props} fill="none" stroke="currentColor" strokeWidth={2}>
      <path
        d="M12 3.5L2.5 20h19L12 3.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 10v4" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CheckmarkIcon(props: IconProps) {
  return (
    <svg {...base} {...props} fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M4 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BarChartIcon(props: IconProps) {
  return (
    <svg {...base} {...props} fill="currentColor" stroke="none">
      <rect x="3" y="12" width="4" height="9" />
      <rect x="10" y="7" width="4" height="14" />
      <rect x="17" y="3" width="4" height="18" />
    </svg>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <svg {...base} {...props} fill="currentColor" stroke="none">
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" />
    </svg>
  );
}

export function QuestionMarkIcon(props: IconProps) {
  return (
    <svg {...base} {...props} fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path
        d="M9.5 9.5a2.5 2.5 0 114 2c-.7.6-1.5 1-1.5 2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
