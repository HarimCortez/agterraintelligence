import type { Config } from "tailwindcss";

/**
 * AgTerra Intelligence Typography System - Tailwind Preset
 * Shared configuration for all apps (@agterra/investor-web, @agterra/admin-web)
 *
 * Enforces:
 * - Two font weights only: regular (400) and semibold (600)
 * - Named type scale tokens (xs, sm, base, md, lg, xl, 2xl, 3xl, 4xl, display, headline-serif, mono)
 * - Line-height and letter-spacing paired with each size
 * - Tabular numerals core plugin
 * - Prose measure utility (max-w-prose at 65ch)
 */

const config: Config = {
  content: [],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },

      fontSize: {
        xs: [
          "var(--text-xs)",
          {
            lineHeight: "var(--text-xs-lh)",
            letterSpacing: "0", // Tracking applied contextually via text-transform or CSS classes
          },
        ],
        sm: [
          "var(--text-sm)",
          {
            lineHeight: "var(--text-sm-lh)",
            letterSpacing: "var(--text-sm-tracking)",
          },
        ],
        base: [
          "var(--text-base)",
          {
            lineHeight: "var(--text-base-lh-ui)", // Default to UI; prose contexts override
            letterSpacing: "var(--text-base-tracking)",
          },
        ],
        md: [
          "var(--text-md)",
          {
            lineHeight: "var(--text-md-lh-ui)",
            letterSpacing: "var(--text-md-tracking)",
          },
        ],
        lg: [
          "var(--text-lg)",
          {
            lineHeight: "var(--text-lg-lh)",
            letterSpacing: "var(--text-lg-tracking)",
          },
        ],
        xl: [
          "var(--text-xl)",
          {
            lineHeight: "var(--text-xl-lh)",
            letterSpacing: "var(--text-xl-tracking)",
          },
        ],
        "2xl": [
          "var(--text-2xl)",
          {
            lineHeight: "var(--text-2xl-lh)",
            letterSpacing: "var(--text-2xl-tracking)",
          },
        ],
        "3xl": [
          "var(--text-3xl)",
          {
            lineHeight: "var(--text-3xl-lh)",
            letterSpacing: "var(--text-3xl-tracking)",
          },
        ],
        "4xl": [
          "var(--text-4xl)",
          {
            lineHeight: "var(--text-4xl-lh)",
            letterSpacing: "var(--text-4xl-tracking)",
          },
        ],
        display: [
          "var(--text-display)",
          {
            lineHeight: "var(--text-display-lh)",
            letterSpacing: "var(--text-display-tracking)",
          },
        ],
        "headline-serif": [
          "var(--text-headline-serif)",
          {
            lineHeight: "var(--text-headline-serif-lh)",
            letterSpacing: "var(--text-headline-serif-tracking)",
          },
        ],
        mono: [
          "var(--text-mono)",
          {
            lineHeight: "var(--text-mono-lh)",
            letterSpacing: "var(--text-mono-tracking)",
          },
        ],
      },

      fontWeight: {
        regular: "400",
        semibold: "600",
      },

      maxWidth: {
        prose: "65ch", // Inline with spec: 60-75ch range, middle at 65ch
      },

      colors: {
        nav: {
          bg: "var(--color-nav-bg)",
          text: "var(--color-nav-text)",
          "text-muted": "var(--color-nav-text-muted)",
        },
        workspace: {
          bg: "var(--color-workspace-bg)",
        },
        surface: {
          DEFAULT: "var(--color-surface)",
        },
        border: {
          subtle: "var(--color-border-subtle)",
          default: "var(--color-border-default)",
        },
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
        },
        action: {
          primary: "var(--color-action-primary)",
        },
        gold: {
          accent: "var(--color-gold-accent)",
        },
        score: {
          exceptional: {
            bg: "var(--color-score-exceptional-bg)",
            text: "var(--color-score-exceptional-text)",
            accent: "var(--color-score-exceptional-accent)",
          },
          strong: {
            bg: "var(--color-score-strong-bg)",
            text: "var(--color-score-strong-text)",
          },
          promising: {
            bg: "var(--color-score-promising-bg)",
            text: "var(--color-score-promising-text)",
            border: "var(--color-score-promising-border)",
          },
          watch: {
            bg: "var(--color-score-watch-bg)",
            text: "var(--color-score-watch-text)",
          },
          limited: {
            bg: "var(--color-score-limited-bg)",
            text: "var(--color-score-limited-text)",
            border: "var(--color-score-limited-border)",
          },
        },
        risk: {
          low: {
            bg: "var(--color-risk-low-bg)",
            text: "var(--color-risk-low-text)",
          },
          medium: {
            bg: "var(--color-risk-medium-bg)",
            text: "var(--color-risk-medium-text)",
          },
          high: {
            bg: "var(--color-risk-high-bg)",
            text: "var(--color-risk-high-text)",
          },
        },
        confidence: {
          verified: {
            bg: "var(--color-confidence-verified-bg)",
            text: "var(--color-confidence-verified-text)",
          },
          modeled: {
            bg: "var(--color-confidence-modeled-bg)",
            text: "var(--color-confidence-modeled-text)",
            border: "var(--color-confidence-modeled-border)",
          },
          "ai-inferred": {
            bg: "var(--color-confidence-ai-inferred-bg)",
            text: "var(--color-confidence-ai-inferred-text)",
          },
          unknown: {
            bg: "var(--color-confidence-unknown-bg)",
            text: "var(--color-confidence-unknown-text)",
            border: "var(--color-confidence-unknown-border)",
          },
        },
        "filter-chip": {
          active: {
            bg: "var(--color-filter-chip-active-bg)",
            text: "var(--color-filter-chip-active-text)",
            border: "var(--color-filter-chip-active-border)",
          },
          inactive: {
            bg: "var(--color-filter-chip-inactive-bg)",
            text: "var(--color-filter-chip-inactive-text)",
            border: "var(--color-filter-chip-inactive-border)",
          },
        },
        marker: {
          exceptional: "var(--color-marker-exceptional)",
          strong: "var(--color-marker-strong)",
          promising: "var(--color-marker-promising)",
          watch: "var(--color-marker-watch)",
          limited: "var(--color-marker-limited)",
        },
      },

      spacing: {
        xs: "var(--space-xs)",
        sm: "var(--space-sm)",
        md: "var(--space-md)",
        lg: "var(--space-lg)",
        xl: "var(--space-xl)",
        "2xl": "var(--space-2xl)",
      },
    },
  },

  plugins: [],
};

export default config;
