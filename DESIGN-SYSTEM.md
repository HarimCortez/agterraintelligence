# AgTerra Intelligence — Design System: Typography

> Source inputs: `REQUIREMENTS.md` (controlled requirements baseline) and `ARCHITECTURE.md` (controlled architecture baseline), both at project root. PRD source: `AgTerra_Intelligence_PRD_v1_Complete.pdf`, Section 7 ("Design Principles," ~pages 26–34 of 43).
> Produced by the `ux` function of the AI Software Development Team operating model. **Scope: typography only.** Color, spacing, and component-visual specs are separate, future work and are intentionally not defined here.
> Status: fully controlled — the Development Director verified PRD Section 7.4 firsthand after `ux` flagged it as unreachable (no PDF tooling in that pass's environment) and corrected two values against the source; see "PRD Access Limitation — Resolved" below. Downstream roles (`fe`, `arch`) should treat this as approved input for `packages/ui`, not re-derive it.

## User Goal

Every current and future screen (10 investor workspaces + 9 admin modules, ~30 shared components per `ARCHITECTURE.md`'s Section E component list) renders text from one inherited, named type system instead of ad hoc utility sizes/weights invented per screen. A user scanning a data-dense table, reading an AI-generated investment thesis, or glancing at a hero Opportunity Score should get consistent, predictable visual hierarchy and effortless numeral comparison — reinforcing the "institutional/GIS-terminal," Bloomberg-style credibility the product is positioned around, not a generic SaaS look.

## Design Principles Reconciliation

**PRD access limitation — resolved.** `ux` could not render the PRD in its pass (no PDF tooling, no shell access to work around it). The Development Director subsequently read PRD Section 7.4 ("Typography and Data Hierarchy," page 13 of 43) directly. It states:

> Page titles: 24–30px equivalent; section headings: 18–22px; card headings: 14–17px; primary metrics: 24–40px; supporting data: 12–15px. Important numbers should dominate labels — example: show "94" as the dominant visual, with "Opportunity Score" and "Exceptional" as support.

This is the **only** typography content in Section 7 — no font family names, no weights, no letter-spacing, no line-height, no measure/paragraph guidance, no rendering guidance. Everything in this document beyond the five size ranges above was legitimately open for `ux` to decide, and those decisions stand. The five ranges are controlled and binding; two of `ux`'s original values fell outside them and are corrected below (not a re-litigation of `ux`'s design judgment — a factual compliance fix against source text `ux` didn't have access to):

1. **`display` token (Opportunity Score hero numeral) was 56px, exceeding the "primary metrics: 24–40px" ceiling** — and the PRD's own worked example for that category *is* the Opportunity Score ("94" as dominant visual). Corrected to 40px, matching the range ceiling exactly. `ux`'s reasoning for wanting something larger (this is the product's single most important number) is reasonable but the PRD has already made this call.
2. **Card titles were mapped to the 18px `lg` token, exceeding "card headings: 14–17px" by 1px.** Reassigned to the 16px `md` token (Semibold), which fits. `lg` (18px) is retained for subsection/drawer headers, which the PRD's "section headings: 18–22px" range covers correctly.

Everything else — page titles resolving to 24px (`2xl`, within the 24-30 range, at its floor rather than ceiling — a valid design choice, not a violation), section headings at 18-20px (`lg`/`xl`, within 18-22), supporting data at 12-14px (`xs`/`sm`/`base`, within 12-15) — was already compliant and required no change.

**What IS confirmed and reconciled into the decisions below (not overridden):**
- Institutional/GIS-terminal aesthetic, not a consumer app (`REQUIREMENTS.md` Objective; DoD #8).
- Dark nav rail + light workspace as two distinct rendering contexts (DoD #8) — addressed under Accessibility.
- Fixed color semantics exist and will govern risk/status signaling (DoD #8) — typography is instructed not to be the *sole* carrier of severity/status meaning (see Accessibility).
- Desktop-first, data-dense tables, map-heavy workflows (Section F / `ARCHITECTURE.md` stack table) — directly shapes the numeral and measure rules below.
- The AI structured response pattern (Conclusion → Evidence → Risks → Confidence → Sources → Next action, Section 8.3) is rendered by one shared component (`ARCHITECTURE.md`, Shared Components) — its section labels and body paragraphs get explicit token assignments below so that component doesn't reinvent typography locally.

## Typeface Selection

Three families, each with a narrowly defined role. This is one addition beyond the starting draft's two-face system — reasoning below.

**1. Workhorse UI/body sans — Inter (variable).**
Source: self-hosted, open license (SIL OFL), Google Fonts–distributed but downloaded and self-hosted, not CDN-loaded at runtime. Chosen over IBM Plex Sans and Söhne for this product specifically because: (a) its numeral set was purpose-designed for dashboard/data-UI legibility at small sizes, which is the dominant use case here (dense tables, KPI cards, badges); (b) it ships as a single variable file covering the full weight axis, minimizing font payload while still letting us restrict *usage* to two weights (see below); (c) Söhne is a commercial license from Dinamo — inconsistent with the "self-hosted, no ongoing licensing friction" requirement, so it's dropped as a candidate rather than validated. IBM Plex Sans remains a credible alternate if the brand later wants a more overtly "engineered" personality than Inter's now-ubiquitous SaaS-default character — flagged as a future option, not adopted now, since Inter's numeral quality is the deciding factor for a numeral-heavy terminal.

**2. Editorial serif accent — Source Serif 4 (variable, used at one static weight).**
Source: self-hosted, open license (SIL OFL), Adobe-designed, built with a full tabular-lining figure set (required — see Numeral Handling). Reserved **narrowly** for: the Opportunity Score hero numeral (Property Intelligence Page and its score-breakdown modal only — not the compact score badge used in tables/cards/map markers, which stays in the workhorse sans; see Implementation Notes) and investment-thesis headline conclusions (the single-sentence AI-generated thesis statement, not full report body copy). Chosen over Newsreader/Fraunces (both credible, more overtly "editorial/boutique" in character) because Source Serif 4's more restrained, press-serious letterforms better match "institutional," not "premium consumer."

**3. Monospace accent — JetBrains Mono (single static weight). Addition to the starting draft, flagged explicitly.**
Source: self-hosted, open license (Apache 2.0). Reserved narrowly for technical/GIS identifiers where misreading a character has a real data-integrity cost: parcel IDs, lat/long coordinates, audit-log entity IDs/hashes, source-citation reference codes. Rationale for adding a third face despite the draft specifying two: the product's own name for its aesthetic is "GIS-terminal," and Bloomberg-style terminals use monospace specifically for this class of technical readout. JetBrains Mono was chosen specifically for its disambiguation-focused glyph design (dotted zero, distinct l/1/I) — a legibility/data-integrity argument, not a stylistic one. This is scoped tightly: never used for body copy, labels, or headings.

**Weight policy — two weights total, resolved concretely (draft said "medium/semibold," left ambiguous):**
- Sans (Inter): **Regular 400** and **Semibold 600** only. Medium 500 is explicitly excluded — at the 12–14px sizes dominant in this product's tables, 400-vs-500 contrast is too weak to reliably carry hierarchy without relying on color alone; 600 gives dependable contrast.
- Serif (Source Serif 4): **Semibold 600 only.** The hero score numeral needs weight to read as a hero moment; thesis-headline sentences also use Semibold 600, not Regular — full rationale in Type Scale usage notes.
- Mono (JetBrains Mono): **Regular 400 only.** No bold/emphasis variant — emphasis in technical-identifier contexts is carried by color/badge treatment (future color-system scope), not font weight, keeping the "two weights total" spirit intact system-wide (in practice: two weight *tokens*, `regular` and `semibold`, used selectively per face).

## Type Scale

Pragmatic modular scale (not a strict single ratio — adjusted for practical pixel/rem values, standard practice for UI type scales). A dedicated `display` token exists for the Opportunity Score hero moment, distinct from `4xl` (both sit at 40px, the PRD Section 7.4 ceiling for "primary metrics") — the distinction is face (Serif vs. Sans), not size: the Opportunity Score is the one number in the product that gets the editorial serif treatment, everything else at that scale (portfolio value, revenue totals) stays in the sans.

12px is the absolute floor — see Accessibility and Implementation Notes for the no-exceptions rule on this.

| Token | px / rem | Face | Weight | Line-height | Tracking | Primary usage |
|---|---|---|---|---|---|---|
| `xs` | 12px / 0.75rem | Sans | Regular (Semibold for labels) | 1.4 | 0 body / **+0.03em** all-caps labels | Table micro-labels, footnotes, source citations, timestamps, absolute size floor |
| `sm` | 13px / 0.8125rem | Sans | Regular | 1.45 | 0 | Dense table cell body text, secondary metadata, form helper text |
| `base` | 14px / 0.875rem | Sans | Regular | 1.3 (UI/table) / 1.5 (prose) | 0 | Default UI body text, primary table cell values, form inputs |
| `md` | 16px / 1rem | Sans | Regular / Semibold | 1.5 (prose) / 1.3 (UI) | 0 | Emphasized body text, modal/dialog body, card primary values, **card titles (Semibold)** |
| `lg` | 18px / 1.125rem | Sans | Semibold | 1.3 | -0.01em | Subsection headers, drawer headers, secondary KPI values |
| `xl` | 20px / 1.25rem | Sans | Semibold | 1.25 | -0.015em | Section headers, modal titles |
| `2xl` | 24px / 1.5rem | Sans | Semibold | 1.2 | -0.015em | Page section titles, property price headline |
| `headline-serif` | 24px / 1.5rem | **Serif** | Semibold | 1.3 | -0.01em | Investment-thesis headline conclusion (single sentence, editorial pull-quote treatment) |
| `3xl` | 32px / 2rem | Sans | Semibold | 1.15 | -0.02em | Hero KPI numbers (portfolio value, revenue totals) — **not** page-title chrome |
| `4xl` | 40px / 2.5rem | Sans | Semibold | 1.1 | -0.02em | Largest sans hero stat (admin revenue overview, portfolio total value) |
| `display` | 40px / 2.5rem | **Serif** | Semibold | 1.1 | -0.02em | Opportunity Score hero numeral **only** (Property Intelligence Page + score-breakdown modal) — PRD Section 7.4 caps "primary metrics" at 40px; this token sits exactly at that ceiling |
| `mono` | 13px / 0.8125rem | **Mono** | Regular | 1.4 | 0 | Parcel IDs, coordinates, audit-log identifiers/hashes, citation reference codes |

Important usage clarification: given the desktop-first, data-dense positioning, actual page/section title chrome should generally sit at `xl`/`2xl`, **not** `3xl`/`4xl`. The largest tokens are reserved for hero *metrics*, not for generic page headings — using them for page titles would waste vertical density and fight the terminal aesthetic.

## Numeral Handling

`font-variant-numeric: tabular-nums` (paired with lining figures) is mandatory on every price, score, percentage, and table-column numeral, with no exceptions — validated from the draft, unchanged. This must be verified on **all three** faces, including Source Serif 4 for the hero score (Adobe's Source Serif ships proper `tnum`/`lnum` OpenType features; `fe` should confirm this survives whatever subsetting/build pipeline is used before shipping).

This is a component-level responsibility, not a per-screen one. Per `ARCHITECTURE.md`'s Shared Components list, tabular-nums must be baked into these components centrally so no screen can drift: KPI card, property card, property table (and its virtualized-table primitive), investment metric card, comparison table, watchlist table, report tier card (pricing), locked intelligence panel (price), Opportunity Score badge, audit-log row (timestamps/counts).

## Paragraph / Measure Rules

60–75 character measure on prose blocks, validated from the draft — applies specifically to: investment thesis body text, AI-generated report narrative sections, AI Analyst Drawer answer text (the Evidence/Risks paragraphs in the structured response pattern), support-ticket conversation text. Tables, cards, KPI values, and badges are exempt — they are not prose and should not be measure-constrained.

Line-height: 1.5–1.6 for these prose contexts (validated, matches WCAG 1.4.8's "line-height at least 1.5× font size" guidance even though we're targeting AA baseline overall — worth noting as a bonus, not a requirement, since 1.4.8 is AAA-level). Headings/UI chrome use the tighter 1.1–1.3 line-heights specified per-token above. `headline-serif` (the thesis-conclusion sentence) sits between the two at 1.3 — it's a short, punchy statement, not a paragraph, so full prose line-height would look loose.

## Rendering & Loading

Self-hosted variable/static font files, validated from the draft — no runtime dependency on Google Fonts CDN or any third-party font host. This avoids an extra DNS/TLS round-trip and keeps the product from leaking user page-load requests to a third party, consistent with an "institutional terminal" security/privacy posture.

`font-display` policy — refined from the draft's blanket `swap`. For the workhorse Inter sans specifically, when it's rendering the *primary numeral content of above-the-fold dense tables* (the dominant first-paint content on Discover, Dashboard, Admin Overview), a font swap that reflows tabular-numeral columns after first paint is more visually disruptive here than on typical marketing content — misaligned columns mid-load can look broken rather than just "unstyled." `fe` should measure real Cumulative Layout Shift impact and choose between `swap` (guarantees text is visible immediately, accepts a possible reflow) and `optional` (accepts a possible brief invisible-text flash on uncached first load, avoids the reflow) for that specific context; `swap` is fine everywhere else (serif thesis headlines, mono identifiers, prose). This is a recommendation to validate against real metrics, not an absolute mandate — flagged as an implementation note, not a rule.

12px absolute minimum, validated and kept as a hard floor with no exceptions — including under space pressure in dense map markers or admin tables. If content genuinely cannot fit at 12px, the correct UX response is truncation, abbreviation, or icon substitution — not shrinking below the floor. `fe`/QA should treat any sub-12px text as a defect regardless of context.

"Near-black on off-white rather than pure black/white" is validated as a principle but the actual hex/token values belong to the future color-system spec (out of scope here, per this task's boundary). What *is* in scope now: the contrast-ratio requirement those future color tokens must satisfy — see Accessibility below.

## Accessibility Requirements

- **Contrast:** WCAG 2.1 AA minimum — 4.5:1 for body text, 3:1 for "large text" (≥24px regular or ≥18.66px/~19px Semibold, i.e. our `lg`/`Semibold` and above tokens qualify under WCAG's large-text definition). Applies in both rendering contexts named in DoD #8: text on the dark nav rail and text on the light workspace background — these are two separate contrast checks, not one. Exact color values are the future color-system's responsibility, but they must be checked against these ratios once defined.
- **Resize/reflow:** support browser text zoom to 200% without loss of content or function (WCAG 1.4.4). Dense tables may use horizontal scroll at high zoom (an accepted reflow exception for data tables) but must not hard-clip text.
- **Meaning must not depend on typography alone:** given the deliberately minimal two-weight system, risk/status signals (risk badges, alert severity, data-confidence tags) must not rely on weight alone to communicate severity — pair with color semantics (future scope) and iconography. Flagged as a cross-team coordination point for whoever specs the risk/status badge components.
- **All-caps labels and screen readers:** apply visual uppercase via CSS `text-transform: uppercase` on normally-cased underlying content, never literal all-caps text in the DOM — some assistive-tech/letter-spacing combinations mis-render literal all-caps or wide-tracked text (spelling out letter-by-letter). QA the label/badge components specifically with VoiceOver and NVDA, not just visually.
- **Reduced motion:** if any font-load fade-in/transition is implemented, it must respect `prefers-reduced-motion`.

## Implementation Notes for `fe`

Concrete enough to implement directly — no further design decisions required. Font files, wherever they end up building, are shared design-system infrastructure and should live once in `packages/ui`, not duplicated per app.

**Font files (self-hosted, `packages/ui/fonts/` or equivalent shared location, loaded via `next/font/local` in each app's root layout — not `next/font/google`):**
- `Inter-Variable.woff2` — full variable weight axis, one file, usage restricted via Tailwind theme (below).
- `SourceSerif4-SemiBold.woff2` — single static weight only (not the full variable file — only one weight is ever used, so the variable-axis payload cost isn't justified here).
- `JetBrainsMono-Regular.woff2` — single static weight only, same rationale.

**CSS custom properties (define once, consume everywhere):**
- `--font-sans`, `--font-serif`, `--font-mono` — family stacks with system fallbacks (e.g. `--font-sans: var(--inter-font), -apple-system, system-ui, sans-serif;` per whatever variable name `next/font/local` generates).
- `--text-xs` through `--text-display`, `--text-headline-serif`, `--text-mono` — one custom property per token in the scale table above.
- `--tracking-tight-heading`, `--tracking-display`, `--tracking-label` (positive), `--tracking-body` (0) — named tracking values, not raw em values repeated per component.
- `--leading-ui`, `--leading-prose`, `--leading-headline` — named line-height values per the distinctions above.

**Tailwind config (`packages/ui`'s Tailwind preset, consumed by `apps/web` and `apps/admin`):**
- `theme.fontFamily`: `sans`, `serif`, `mono` mapped to the CSS custom properties above.
- `theme.fontSize`: one key per token in the scale table, each defined as Tailwind's `[fontSize, { lineHeight, letterSpacing }]` tuple format so line-height/tracking travel with the size automatically — do not let components set line-height/tracking separately from the size, that's exactly the drift this spec exists to prevent.
- `theme.fontWeight`: **override Tailwind's default 100–900 scale down to only `regular: 400` and `semibold: 600`.** This is the concrete enforcement mechanism for "two weights total" — it should be structurally impossible for a component to reach for `font-bold` (700) or `font-light`, not just discouraged by convention.
- Tabular numerals: use Tailwind's built-in `tabular-nums` core-plugin utility (already ships with Tailwind — no custom CSS needed). Apply it inside the shared components listed under Numeral Handling, centrally, not per-screen.
- Prose measure: Tailwind's built-in `max-w-prose` utility already defaults to `65ch` — this happens to sit in the middle of the required 60–75ch range. Use it directly for the prose contexts listed above rather than defining a custom measure utility.

**Component-level flags for `fe`/`arch` to resolve (design intent stated, implementation shape is theirs):**
- The Opportunity Score **badge** (compact, used across tables/cards/map markers per `ARCHITECTURE.md`'s Shared Components) stays in the workhorse sans at `sm`/`base` — it is explicitly *not* the serif hero context. The Opportunity Score **hero display** (Property Intelligence Page, score-breakdown modal) uses `display`/serif. Whether the hero is the same badge component with a `variant="hero"` prop or a distinct one-off element is an implementation decision for `fe`/`arch`, not decided here — flagging so it isn't accidentally decided by whichever engineer touches it first.
- The structured AI response renderer (the single shared component rendering Conclusion→Evidence→Risks→Confidence→Sources→Next-action per `ARCHITECTURE.md`) should use `xs`/Semibold with `--tracking-label` for its six section labels, and `base`/prose-measure/prose-line-height for its Evidence/Risks body paragraphs — defined once in that component, per Architecture's own instruction that it's "the single place the pattern is rendered."
- Nav rail (dark background) text: no separate face — same sans tokens as the rest of the product (likely `sm`/`base`, Regular with Semibold for active state); only the *contrast* against the dark background differs, which is color-system scope, not typography scope.

**Not decided here (explicitly out of scope, future work):** color tokens/hex values (including the "near-black on off-white" pairing), spacing scale, component visual specs beyond the typography role assignments above.

## Color & Spacing — Discover + Map Workspace (Pass 1)

> Scope: this pass defines **only** the tokens the Discover + Map Workspace screen's components actually need — app shell (nav rail + light workspace), property card, Opportunity Score badge, risk flag badge, data confidence indicator, filter panel, map marker color expression, and a small spacing scale. It does not define color for the other 9 investor workspaces or 9 admin modules, does not define a dark-mode toggle theme, and does not define the map overlay layers (soil/flood/zoning) that are explicitly a later phase per this task's scope note. Those remain future work, same as this document's Typography section originally scoped color/spacing out.
> Controlled inputs (not re-derived, only converted to concrete values): PRD Section 7.3 "Visual Direction" (dark nav rail / light workspace / green-opportunity / gold-premium / amber-red-risk / blue-information / "icons supplement labels, never replace them") and Section 8.1's Opportunity Score band table (5 bands, quoted verbatim in the task brief), plus `REQUIREMENTS.md`'s Business Rules — four-state data confidence (verified/modeled/AI-inferred/unknown) and "positive opportunity signals must never hide risk indicators." Everything below — the actual hex values, the spacing base unit, and how the "not color alone" pairings are constructed — is `ux` judgment, same division of labor as the typography section's PRD-vs-`ux` split.
> Light mode only. The dark nav rail is a fixed dark surface (not a theme toggle) per PRD 7.3 and DoD #8 — it exists regardless of whether the workspace itself ever gets a dark-mode variant later.

### A Cross-Cutting Rule Established Here (applies to every badge family below)

Two shape/pattern conventions are introduced now so `fe` doesn't reinvent them per badge family and so they stay meaningfully scoped (not overloaded into meaning different things in different places):

1. **Solid fill = a confirmed, primary signal. Tint/outline fill = a secondary or lower-emphasis signal within the same family.** Used inside the Opportunity Score bands (solid for Exceptional/Strong, tint for Promising/Limited) and inside risk severity (solid for Medium/High, tint for Low).
2. **Dashed border = genuine data-provenance uncertainty, and *only* that.** Reserved exclusively for the Data Confidence family (`Modeled`, `Unknown`). It is deliberately **not** reused on the Opportunity Score's `Limited Opportunity` band — that band is a confidently low score, not an uncertain one, and reusing the "uncertain data" pattern there would misstate what it means. Low score ≠ uncertain data; keep those two ideas visually distinct even though both are "muted."

This is also the mechanism that keeps Risk Severity and Data Confidence from collapsing into "the same amber-ish thing" (per the task's explicit requirement): Risk Severity uses the PRD's amber→red hue ramp with solid/tint fill only; Data Confidence uses a blue→violet→slate hue family (outside PRD's risk hues entirely) plus the dashed-border grammar that Risk Severity never uses.

### Neutrals & App Shell

| Token | Hex | Usage | Rationale |
|---|---|---|---|
| `color-nav-bg` | `#10151C` | Nav rail background (fixed dark surface, all contexts) | Deep navy-charcoal rather than pure black — reads as "GIS-terminal," not flat OS-chrome black; has enough blue undertone to stay in the same family as the `action`/blue hue used elsewhere, so the shell doesn't feel disconnected from the workspace accent color. |
| `color-nav-text` | `#F4F6F8` | Primary nav rail text/icon labels | Near-white, not pure white — matches the "near-black on off-white, not pure black/white" principle the typography doc already established, applied symmetrically to the dark surface. |
| `color-nav-text-muted` | `#A8B1BD` | Inactive/secondary nav rail labels | Muted enough to visually recede behind the active item without dropping below AA (verified below) — inactive nav items are still real labels a user reads, not decorative, so they can't drop to a "just barely visible" gray. |
| `color-workspace-bg` | `#EEF1F4` | Light workspace canvas — page background behind cards/panels, Discover's list+map split background | Visibly gray rather than white, so cards/panels (white) read as distinct surfaces sitting *on* the workspace — this is what makes "compact cards" and "structured grids" (PRD 7.3) actually legible instead of everything blurring into one flat white page. |
| `color-surface` | `#FFFFFF` | Card, panel, and table row background (property card, filter panel, modals) | Pure white reserved for content surfaces specifically *because* the workspace canvas is gray — the contrast between the two is the grid structure, not a decorative choice. |
| `color-border-subtle` | `#E2E5EA` | Card borders, table row dividers | Decorative-tier separation — reinforced by spacing and the bg/surface contrast above, not the sole way a card boundary is perceived, so it doesn't need to clear the 3:1 non-text threshold on its own. |
| `color-border-default` | `#D7DBE2` | Input borders, filter panel outer border, anything a user needs to identify as an interactive boundary | One step darker than `border-subtle` specifically for cases where the border *is* load-bearing (form fields) rather than purely decorative. |
| `color-text-primary` | `#14181F` | Primary text on `workspace-bg` and `surface` (property card titles/addresses, table primary values, page headings) | Near-black, cool-toned to match the workspace's cool-gray undertone rather than a warm near-black, which would clash with it. |
| `color-text-secondary` | `#4B5563` | Secondary/supporting text on `workspace-bg` and `surface` (metadata, timestamps, helper text, card sub-lines) | One consistent secondary-text gray reused everywhere text hierarchy needs a step down from primary, rather than inventing a new gray per component. |

### Semantic Accent (PRD-assigned roles, this pass's concrete values)

| Token | Hex | Usage | Rationale |
|---|---|---|---|
| `color-action-primary` | `#2563EB` | Primary buttons, links, active/selected states, active filter chip | PRD 7.3's "blue for information/actions" role. Mid-saturation blue, legible at both button-fill and link-text sizes (verified below both ways since the ratio is symmetric). |
| `color-gold-accent` | `#C9971C` | Icon/border accent **only** (never body text) inside the `Exceptional` score badge, and reserved generally for "premium/high-value signal" per PRD 7.3 | Kept strictly to an icon/accent role, never text-on-text, because gold-on-white or gold-on-light text fails contrast at small sizes — using it only as an icon/border accent against a dark green fill (verified below as a non-text 3:1 pairing) gets the "premium" cue without a contrast failure. |

### Opportunity Score Badge — 5 Bands

Each band pairs its background hue with a **distinct icon glyph + always-visible label text** (per PRD 7.3, "icons supplement labels; labels must not be replaced by icons alone," and the business rule that meaning can't ride on color alone). A deliberate hue decision: only the top three bands (90+, 80-89, 70-79) use green — the bottom two bands (`Watch`, `Limited Opportunity`) use **neutral slate, not amber/red**. This is intentional: PRD 8.1 describes `Limited Opportunity` as "lower priority," not risky ("may still be useful for niche strategies") — coloring it amber/red would visually conflate "low opportunity score" with "risk flag present," which are two independent signals a property can have in any combination (a `Limited Opportunity` property can be risk-flag-free, and an `Exceptional` property can carry a high-severity risk flag). Amber/red stays reserved exclusively for the Risk Flag badge below.

| Band (PRD 8.1) | Fill style | Background | Text/icon color | Icon | Extra shape cue | Label |
|---|---|---|---|---|---|---|
| 90–100 Exceptional | Solid | `#14532D` | `#FFFFFF` text; `#C9971C` gold icon | Filled star | 3px gold left-border accent (unique to this band) | "Exceptional" |
| 80–89 Strong | Solid | `#1E7A42` | `#FFFFFF` | Filled up-chevron | — | "Strong" |
| 70–79 Promising | Tint | `#E3F2E7` | `#1B5E36` | Outline up-chevron + small superscript circle-dot | Thin solid border `#BFE5CB` | "Promising" |
| 60–69 Watch | Solid | `#475569` | `#FFFFFF` | Eye glyph | — | "Watch" |
| Below 60 Limited Opportunity | Tint | `#E9EBEF` | `#374151` | Minus/dash glyph | Thin solid border `#D7DBE2` (reuses `border-default`) | "Limited" (compact) / "Limited Opportunity" (full) |

**Contrast verification (all badge text sits at `xs`/`sm`, i.e. 12–13px — below WCAG's "large text" threshold, so the mandatory bar is 4.5:1, not the relaxed 3:1):**
- Exceptional: white on `#14532D` → **9.12:1** — pass. Gold icon (`#C9971C`) on `#14532D` (non-text/graphical element, 3:1 threshold applies) → **3.44:1** — pass.
- Strong: white on `#1E7A42` → **5.36:1** — pass.
- Promising: `#1B5E36` on `#E3F2E7` → **6.71:1** — pass.
- Watch: white on `#475569` → **7.58:1** — pass.
- Limited: `#374151` on `#E9EBEF` → **8.64:1** — pass.

### Risk Flag Badge — Severity (`property_risk_flags.severity`: low / medium / high)

Amber→red ramp per PRD 7.3, visually escalating through **three independent cues**, not color alone: fill weight (tint → solid → solid), icon glyph *and count* (one outline flag → one filled flag → filled flag + exclamation triangle), and the mandatory label text.

| Severity | Fill style | Background | Text/icon color | Icon | Label |
|---|---|---|---|---|---|
| Low | Tint | `#FEF3C7` | `#92400E` | Outline flag | "Low risk" |
| Medium | Solid | `#B45309` | `#FFFFFF` | Filled flag | "Medium risk" |
| High | Solid | `#B91C1C` | `#FFFFFF` | Filled flag + exclamation triangle | "High risk" |

**Contrast verification:**
- Low: `#92400E` on `#FEF3C7` → **6.37:1** — pass.
- Medium: white on `#B45309` → **5.02:1** — pass. (Note: Tailwind's stock amber-500/600 fail here — `#D97706` only reaches 3.19:1 with white text, which is why `#B45309`/amber-700 was selected instead; flagging so `fe` doesn't "simplify" this to a lighter stock amber later.)
- High: white on `#B91C1C` → **6.47:1** — pass.

### Data Confidence Indicator (`verified` / `modeled` / `ai_inferred` / `unknown`)

Deliberately a **different hue family** (blue → violet → slate) from both the green opportunity bands and the amber/red risk bands, per the task's requirement that confidence not visually collide with either. It also uses a structurally different fill grammar (tint/outline chips throughout, never a solid full-bleed fill) so that even at a glance, in peripheral vision, a confidence tag doesn't read as "as urgent/loud" as a Medium/High risk badge — confidence is about data trust, not danger, and the two should never compete for the same level of visual alarm. Each state pairs a distinct icon **and** the solid-vs-dashed border grammar defined above (solid border = confirmed provenance, dashed border = estimated/unresolved provenance) with the mandatory label.

| State | Background | Text/icon color | Border | Icon | Label |
|---|---|---|---|---|---|
| Verified | `#DBEAFE` | `#1E40AF` | Solid, none needed (filled tint reads as confirmed) | Filled checkmark | "Verified" |
| Modeled | `#FFFFFF` | `#1D4ED8` | **Dashed** `#93C5FD` | Bar-chart/estimate glyph | "Modeled estimate" |
| AI-inferred | `#EDE9FE` | `#5B21B6` | Solid, none needed | Sparkle glyph | "AI inferred" |
| Unknown | `#F1F5F9` | `#475569` | **Dashed** `#94A3B8` | Question-mark glyph | "Unknown" |

**Contrast verification:**
- Verified: `#1E40AF` on `#DBEAFE` → **7.15:1** — pass.
- Modeled: `#1D4ED8` on `#FFFFFF` → **6.70:1** — pass.
- AI-inferred: `#5B21B6` on `#EDE9FE` → **7.57:1** — pass.
- Unknown: `#475569` on `#F1F5F9` → **6.92:1** — pass.

### Filter Panel

| Token | Hex | Usage |
|---|---|---|
| `color-filter-panel-bg` | `#FFFFFF` (reuses `surface`) | Filter panel surface, sitting on `workspace-bg` for separation, same grid logic as the property card |
| `color-filter-panel-border` | `#D7DBE2` (reuses `border-default`) | Panel outer border |
| Active filter chip | bg `#DBEAFE`, text `#1E40AF`, border `#93C5FD`, pill shape, dismiss "×" | Reuses the same blue as `action-primary`/`Verified` confidence — intentionally: blue = "information/active state" system-wide per PRD 7.3, and chips never appear adjacent to confidence badges in this layout, so there's no real ambiguity risk. Shape differs (rounded-full pill + dismiss control vs. rounded-rectangle tag with no dismiss) as the disambiguator if they ever do end up in the same view. |
| Inactive/available filter chip | bg `#F1F5F9`, text `#475569`, border `#E2E5EA` | Neutral, low-emphasis, same logic as above re: reuse being safe by context separation |

Contrast for the active chip text is the same pairing as `Verified` confidence (`#1E40AF` on `#DBEAFE`) → **7.15:1** — pass. Inactive chip text `#475569` on `#F1F5F9` → **6.92:1** (same pairing as `Unknown` confidence) — pass.

### Map Marker — Opportunity Score Color Expression

Markers are small (a Mapbox GL circle layer, not room for icon + label at typical zoom), so this is deliberately a **simplified, color-only encoding of score band alone** — which is acceptable specifically because a map marker is never the only place a given property's data appears: the same property is always simultaneously listed in the accompanying property list/card (full badge with icon + label) per this screen's list+map layout, and clicking/hovering a marker opens a popover using the full badge component. The map is a color-coded index into the accessible view, not a standalone accessible surface on its own — that division of responsibility should be treated as load-bearing, not incidental, if `fe`/`arch` ever consider a map-only or map-fullscreen mode later, that mode would need the icon/label treatment reintroduced.

**Risk is a separate, mandatory overlay cue on the marker itself — never folded into the score color.** Per the business rule that positive signals must never hide risk indicators, any property with an active `medium` or `high` severity risk flag gets a small corner indicator (a warning-triangle glyph, using the same `#B45309`/`#B91C1C` risk colors) composited onto the marker regardless of how green the base score color is. A high-scoring, high-risk property must never render as a "clean" green dot.

Suggested marker sizing as an additional non-color cue (not required, but recommended so the map isn't purely color-coded even at the index level): a subtle 1–2px white ring on `Exceptional`-band markers only, giving the top tier a slightly higher visual weight independent of hue.

Score-band marker fill colors (same green→slate logic as the badge, simplified to five flat hues, no gold/tint variants at marker scale):
- 90–100: `#14532D`
- 80–89: `#1E7A42`
- 70–79: `#3FA65C`
- 60–69: `#64748B`
- Below 60: `#CBD5E1`

### Spacing Scale

Base unit 4px — a pragmatic scale (parallel to the typography section's "pragmatic modular scale, not a strict ratio" approach), sufficient for this screen's card padding, list gaps, and filter panel layout. Not exhaustive; extend only as new components require it, don't pre-build the full future scale now.

| Token | Value | Usage |
|---|---|---|
| `space-xs` | 4px | Icon-to-label micro gaps inside badges/chips, badge internal padding |
| `space-sm` | 8px | Chip padding, compact list-item internal spacing, gaps between inline related elements (e.g. score badge + risk badge in a card header row) |
| `space-md` | 12px | Property card internal padding, gap between stacked text lines within a card |
| `space-lg` | 16px | Gap between cards in the property list, filter panel internal section spacing |
| `space-xl` | 24px | Filter panel outer padding, list-panel-to-map layout gutter, major section breaks |
| `space-2xl` | 32px | Page-level outer margins, nav-rail-to-workspace boundary padding |

Desktop-first per `ARCHITECTURE.md`'s stack table — this scale is not responsive-scaled down for mobile in this pass; if/when a mobile Discover view is scoped, that's a follow-up pass, not an assumption to bake in now.

### Implementation Notes for `fe`

**CSS custom properties (same naming convention as the typography section's `--font-*`/`--text-*`):**
- `--color-nav-bg`, `--color-nav-text`, `--color-nav-text-muted`, `--color-workspace-bg`, `--color-surface`, `--color-border-subtle`, `--color-border-default`, `--color-text-primary`, `--color-text-secondary`, `--color-action-primary`, `--color-gold-accent`.
- Per-family, per-state properties following the pattern `--color-score-{band}-bg` / `-text` / `-accent` (exceptional/strong/promising/watch/limited), `--color-risk-{severity}-bg` / `-text` (low/medium/high), `--color-confidence-{state}-bg` / `-text` / `-border` (verified/modeled/ai-inferred/unknown).
- `--space-xs` through `--space-2xl`.

**Tailwind config (`packages/ui` preset, `theme.colors` extension — additive to the typography preset already in place, not a replacement):**
- Nested keys: `colors.nav.{bg,text,'text-muted'}`, `colors.workspace.bg`, `colors.surface.DEFAULT`, `colors.border.{subtle,default}`, `colors.text.{primary,secondary}`, `colors.action.primary`, `colors.gold.accent`, `colors.score.{exceptional,strong,promising,watch,limited}.{bg,text,accent?}`, `colors.risk.{low,medium,high}.{bg,text}`, `colors.confidence.{verified,modeled,'ai-inferred',unknown}.{bg,text,border}`.
- `theme.spacing`: add named aliases `xs/sm/md/lg/xl/2xl` mapped to 4/8/12/16/24/32px **alongside** Tailwind's existing numeric scale (don't replace `p-4`/`gap-6` etc. — add the semantic aliases so component code can read `p-space-md` where a named token communicates intent better than a bare number, consistent with the system's overall preference for named tokens over raw utility values established in the typography section).

**Mapbox GL marker color-expression approach:**
Use a `step` expression (discrete band thresholds, not `interpolate`, since the bands are non-linear cliffs, not a continuous gradient) on the circle layer's `circle-color`:
```js
'circle-color': [
  'step',
  ['get', 'opportunity_score'],
  '#CBD5E1',       // < 60  Limited
  60, '#64748B',    // 60-69 Watch
  70, '#3FA65C',    // 70-79 Promising
  80, '#1E7A42',    // 80-89 Strong
  90, '#14532D'     // 90-100 Exceptional
]
```
Risk indicator is a **separate layer** (small symbol/icon layer offset to the marker's corner), filtered to properties with an active medium/high `property_risk_flags` row, with its own `['match', ['get','max_risk_severity'], 'high', '#B91C1C', 'medium', '#B45309', 'transparent']` expression — composited on top of, never blended into, the score circle layer. This keeps the two data dimensions (opportunity vs. risk) as genuinely independent map layers, mirroring the same separation enforced in the badge components.

**Open questions flagged for `fe`/`arch`, not resolved here:**
- Whether the map popover on marker click/hover reuses the exact same Property Card / Opportunity Score badge React components as the list (recommended, for consistency and to avoid a second accessible-markup implementation) or a lighter-weight variant — implementation shape, not a design decision.
- Cluster-marker styling (when multiple properties collapse into a count bubble at low zoom) is not addressed in this pass — clusters have no single score to encode and need their own small spec; flagged as a gap for whoever builds map clustering, not silently decided by them.
