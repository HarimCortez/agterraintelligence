> UX design spec for the two screens defined in
> `docs/requirements/report-selection-purchase-and-purchased-report-workspace.md`
> ("the requirements doc"). This document does not re-derive pricing, tiers,
> upgrade-credit math, ownership rules, or scope boundaries — every business
> rule below is cited from that doc's Functional Requirements (FR#) /
> Business Rules (BR#) / Edge Cases (EC#). This document adds: routes,
> layout, screen states, interaction behavior, and IA placement, matching
> the investor app's existing component/state conventions (cited inline).

## Screen 1 — Report Selection & Purchase

### Route
`/properties/[id]/reports` (path segment chosen over a modal — this is a
multi-state, potentially error-prone, payment-adjacent decision; it deserves
a real URL a user can land on directly, refresh, or return to, not a modal
that's lost on refresh).

### Entry point — Property Intelligence Page CTA

Placed as its own section, directly **after the Opportunity Score hero and
before Valuation** (`PropertyDetailView.tsx`'s existing section order) —
purchasing deeper intelligence is a top-of-page decision investors should
see before scrolling into supporting detail, not something to discover only
after the AI Analyst panel at the bottom.

Three CTA variants, all in the same section slot (component swaps by state,
section never disappears):

| Investor state | CTA | Behavior |
|---|---|---|
| No report owned for this property (default — includes logged-out) | Primary button, **"Unlock Full Report"** | Navigates to `/properties/[id]/reports` |
| Owns 1+ `delivered` report, and a higher tier still exists | Two elements: secondary button **"View Your Report"** (→ workspace for their highest owned `delivered` order) + text link **"Upgrade for deeper analysis"** (→ `/properties/[id]/reports`) | Both visible together — re-access and upgrade are both live intents on a repeat visit, per requirements doc's User Story #4 |
| Owns `delivered` report at the top purchasable tier (Professional) already | Single secondary button **"View Your Report"** only — no upgrade link (Professional is the ceiling; Premium isn't purchasable, per BR5) |
| Has only a `pending_payment` order (abandoned checkout, no `delivered` order) — EC7 | Same as "no report owned" — **"Unlock Full Report"**. A `pending_payment` order is never surfaced as if owned; it's invisible in this CTA (not "resume purchase" — selecting a tier fresh is equivalent and simpler) |

Section copy under the CTA (both no-report and has-report variants): one
line reusing the same "AI-generated ... not a substitute for professional
due diligence" register already used by `AiAnalystPanel`, e.g. *"A purchased
report is a persisted, deeper AI-generated investment analysis of this
property — yours to revisit anytime."*

Data needed to pick the CTA variant: `GET /v1/properties/:id/reports`
(existing, per Dependency #1) — fetched by the Property Intelligence Page
itself for authenticated users only (skip the call entirely when logged
out, matching `WatchToggle`'s `enabled: !!user` pattern). While this query
is loading, render the "no report owned" default CTA (not a spinner in this
slot) — it's the statistically correct guess for a first paint and avoids a
layout-shifting loading state on the highest-visibility CTA on the page; if
the query resolves to "owns a report," the CTA swaps in place. If the query
errors, fall back to the same default CTA (never block the whole page on
this one section failing — matches the resilience principle already used
elsewhere, e.g. `AiAnalystPanel`'s independent error boundaries per section).

### Layout

Page structure, top to bottom:
1. Back link: `← Back to [Property Address]` (mirrors `PropertyDetailView`'s
   `← Back to Discover` pattern) → `/properties/[id]`.
2. Page header: property address (reuse the same `text-2xl font-semibold`
   treatment as the Property Intelligence Page's `<h1>`) + one-line context
   ("Choose the depth of AI-generated investment analysis for this
   property.").
3. Subscriber/non-subscriber pricing banner (see below).
4. Four tier cards in a single responsive row (`grid-cols-1` mobile →
   `grid-cols-2` tablet → `grid-cols-4` desktop), ordered Essential →
   Investor → Professional → Premium (matches `sortOrder` from
   `GET /v1/report-tiers` — never re-sorted client-side).
5. Footer note: link to Support Center for purchase questions.

**Subscriber/non-subscriber banner** (FR3) — a single-line strip above the
cards, not per-card noise:
- Non-subscriber, viewing: *"You're seeing non-subscriber pricing. [Upgrade
  to a paid plan →] to lower this and every future report price by 33%."*
  (link → `/account`, matches `UpgradeState`'s existing `/account` link
  pattern in `AiAnalystPanel`). The "33%" phrasing: non-subscriber price is
  subscriber price ×1.5, so subscriber price is non-subscriber price ×0.667
  — a subscriber saves 33% relative to non-subscriber price. Exact copy
  wording is a content-review nit for `fe`/PM at build time, not a blocking
  design decision.
- Subscriber, viewing: *"Subscriber pricing applied."* (quiet confirmation,
  no CTA).
- Logged-out, viewing: *"Log in to see your subscriber pricing, or continue
  below — pricing shown is non-subscriber."* (non-subscriber price is what's
  publicly correct per FR8: pricing is public data).

**Tier card anatomy** (all four cards share one component; content/CTA
region varies by state below):
- Tier display name (e.g. "Investor").
- Price — the investor's applicable price (subscriber or non-subscriber per
  FR3), `tabular-nums`, large weight (matches `MetricCard`'s numeral
  treatment on the Property Intelligence Page). If a non-subscriber, show
  the subscriber price struck through/secondary next to it as a save-more
  nudge (small, doesn't compete with the primary price) — content-level
  reinforcement of the banner above, not a separate decision.
- One short "depth" description per FR6's hard constraint — depth/thoroughness
  language only, never fabricated content categories. Suggested copy
  register (final wording is PM/content, not asserted as final here):
  - Essential: "Thesis-depth AI read — conclusion, key evidence, top risks."
  - Investor: "Deeper evidence and scenario framing beyond the thesis."
  - Professional: "Most thorough AI-generated analysis available — expanded
    evidence, risk, and scenario detail."
  - Premium: "Analyst-reviewed intelligence (not yet available)."
- CTA region — state-dependent, see table below.
- A visual "Recommended" tag is **not** included in this pass — the
  requirements doc doesn't establish a recommendation basis (no usage data,
  no property-specific signal driving it), and fabricating one risks
  steering a purchase decision without a real rule behind it. If Product
  wants a recommended-tier treatment later, that's a scoped follow-up, not
  invented here.

**Tier card CTA states** (evaluated per card, independently):

| Card state | Visual | CTA |
|---|---|---|
| Purchasable, not owned, no credit applies | Standard card | Primary button "Select [Tier]" |
| Purchasable, not owned, upgrade credit applies (FR4) | Standard card + a highlighted credit line above the CTA: *"Your credit: −$49.00 (from your Essential report) → Net price: $50.00"* `tabular-nums` on both figures | Primary button "Select [Tier] — $50.00" (net price in the button label itself, not just above it, so the committed price is unambiguous at the moment of the click) |
| Already owned at this tier or higher (FR5/BR4) | Card visually deprioritized (reduced-emphasis border/background, matching the "locked but visible" treatment described below — not literally locked content, but the same "state clearly communicated, card stays present" principle) + a small "You own this" badge | Secondary button **"View Your Report"** → workspace for that property+tier's order. No buy affordance rendered at all — not disabled-and-explained, just replaced, since this isn't a permission gate, it's "you already have this," a different message than a locked-content pattern |
| Premium (BR5, non-purchasable this pass) | Card rendered in the **locked-intelligence pattern** (see below) — visible, priced, described, but CTA replaced | Disabled-look button (not a real disabled `<button>` if it needs a tooltip — use a non-interactive element or a `<button disabled>` with adjacent text) reading **"Not yet available"**, with the API's own message surfaced as sub-text: *"Requires analyst review — not yet available for purchase."* No click reaches checkout; this is enforced in the UI, matching FR2/AC5, not just relying on the backend's 400 |

**Locked-intelligence pattern reuse** — per the requirements doc's Business
Rule 8 and `REQUIREMENTS.md` Section 8.2 ("locked/paid sections must remain
visible, not hidden... state what's available, the required tier,
price/upgrade path, and why it matters"). The existing codebase
implementation of this general posture is `AiAnalystPanel`'s
`UpgradeState`/`LoggedOutState` components (visible section, explains what's
gated and how to unlock it, never hides the section) — Premium's card
follows the same posture: visible, priced, described, CTA disabled with a
clear reason, never hidden or removed from the grid.

### States

**Default / first-visit (logged-in, no owned reports on this property)**
All four cards purchasable-or-not per BR5 only; no credit lines; no
owned-tier badges.

**Has existing lower delivered tier (upgrade credit applies) — FR4**
For every tier card strictly above the owned tier: show the credit line +
net price in the CTA, as above. For the owned tier and everything below it:
"You own this" / "View Your Report" per the table above (an owned Essential
report means Essential's own card also shows "You own this," not a buy
button — EC3, "downgrade" attempts must not even render as purchasable).

**Has existing tier at or above the viewed tier — FR5/AC4**
Every tier at or below the owned tier shows "View Your Report" (routes to
that specific order — if multiple owned tiers exist, each one's own card
routes to its own order, not all to the same one). Only strictly-higher
tiers remain purchasable (with credit applied, per the rule above).

**Logged out — FR8/EC4**
All four cards render fully (public pricing data, non-subscriber price
shown per the banner above) with normal-looking primary "Select [Tier]"
buttons. Clicking any purchasable tier's button does **not** call checkout —
it opens the existing login prompt pattern (redirect to `/login`, matching
`WatchToggle`'s and `FilterPanel`'s established "click while logged out →
`/login`" convention) with a return path back to
`/properties/[id]/reports` with the selected tier remembered (pass the
selected tier code as a query param, e.g. `?tier=investor`, so on return the
same tier's purchase can resume with one more click rather than starting
over — FR8's "returns the user to this same screen/tier selection
afterward").

**Loading tier data** (`GET /v1/report-tiers` in flight)
Four skeleton cards (`animate-pulse` blocks, same treatment as
`PropertyDetailView`'s `LoadingState`), `role="status"`, `aria-live="polite"`,
visually-hidden text "Loading report options…". Does not block the rest of
the page — this screen has no other content competing for the loading
state.

**Tier-data fetch error**
Full-width `role="alert"` block, matching `PropertyDetailView`'s
`ErrorState` component exactly (message + "Retry" button) — tiers are
required to render anything meaningful on this screen, so this is a
page-level error state, not a per-card one.

**Mid-purchase (checkout-session creation in flight) — FR7**
The clicked tier's own button only enters a loading state ("Creating
checkout…", spinner matching `AiAnalystPanel`'s inline spinner treatment) —
the other three cards' buttons become disabled (not hidden) to prevent a
second concurrent checkout attempt, but remain visible so the user isn't
confused about what's happening elsewhere on the page. No full-page
overlay/blocking spinner — this is a single-card mutation, not a
page-level transition, until the redirect actually happens.

**Purchase-initiation error (checkout-session creation failed)**
Inline `role="alert"` beneath the specific card that failed (not a
page-level banner — the user needs to know *which* tier's attempt failed),
reusing `AiAnalystPanel`'s `ErrorState`-style block (message + "Retry"
button that re-fires the same checkout call). Distinguish the two realistic
failure shapes the API can return:
- 409 "already own this tier or higher" (BR4/EC2) — should be rare since the
  UI prevents the click proactively, but if a race occurs (e.g. two tabs),
  show this exact message and refresh the card states from
  `GET /v1/properties/:id/reports` so the card immediately flips to "View
  Your Report."
- Any other error (503 Stripe unavailable, network, etc.) — generic retry
  message, same register as `PropertyDetailView`'s `ErrorState`: "Couldn't
  start checkout. [Retry]"

### Interaction: single-click vs. confirmation step

**No separate confirmation modal.** Clicking "Select [Tier] — $X" goes
straight to creating the checkout session and redirecting to Stripe. Reasons:
(1) the price is already fully visible on the button itself at the moment of
the click (net price included in the label, per the CTA table above) — an
extra "Are you sure you want to pay $50.00?" modal would repeat information
already on-screen without adding a real decision point; (2) Stripe's own
hosted checkout page is itself the true confirmation step (it shows the
line item and requires an explicit "Pay" action there) — a second in-app
confirmation before an off-site confirmation is redundant friction, not
added safety. This matches FR7's framing ("selecting a tier and confirming
purchase calls checkout") as a single action, not two.

Before the redirect fires, the button's own loading state ("Creating
checkout…") is the only signal — no toast, no modal — consistent with how
`WatchToggle`/`CompareToggle` handle their own mutations inline without
separate confirmation UI.

### "View Your Report" navigation
Routes directly to `/report-orders/[orderId]` (Screen 2) for that specific
order — never through an intermediate list, since FR14 confirms no
cross-property/cross-tier index exists. If an investor owns more than one
`delivered` order for the same property (e.g. Essential then upgraded to
Investor), each card's "View Your Report" points at that specific tier's
own order id — never defaults to "most recent" or "highest," since a user
might legitimately want to reopen an earlier tier's report.

---

## Screen 2 — Purchased Report Workspace

### Route
`/report-orders/[id]` — a standalone, orderId-scoped route (not nested
under `/properties/[id]/...`) since the order id alone is sufficient to
resolve everything the screen needs (`GET /v1/report-orders/:id` already
returns `propertyId`), and this matches the requirements doc's own suggested
route.

### How the investor reaches it
1. **Post-purchase redirect (preferred, pending Dependency #2's `be`/`arch`
   fix).** Once the backend redirect carries `reportOrderId`, Stripe's
   success redirect should land the investor directly on
   `/report-orders/[id]` for the order just paid for — this is the correct
   target UX regardless of when the backend gap closes; this document
   specifies it as the intended behavior, the backend change itself is out
   of this document's scope per Dependency #2.
2. **Interim state (current gap, until #1 ships).** Today's redirect lands
   on `/account?checkout=success` with no order id. `/account`'s existing
   `checkout=success` handling (already shows a confirmation banner +
   refetches subscription status per `checkout-urls.ts`'s comment) should
   additionally, for a report purchase specifically, surface a link to
   "View your report" — this requires the account page to be able to
   identify *which* order was just purchased. Since the redirect carries no
   order id yet, the only reliable option within current data is: the
   account page's success banner links to the originating property's page
   (`/properties/[id]`) rather than guessing an order id — the Property
   Intelligence Page's own "View Your Report" CTA (Screen 1's entry-point
   section) then resolves the correct order via the already-implemented
   `GET /v1/properties/:id/reports`. This satisfies AC6's "reachable within
   one additional click" without the frontend fabricating an order id it
   doesn't have. **This interim routing detail depends on knowing the
   property id at redirect time, which the current generic
   `/account?checkout=success` redirect also does not carry** — flag this
   specific sub-gap back to `be`/`arch` alongside Dependency #2 rather than
   have `fe` invent a workaround; if truly no property id is recoverable
   client-side today, the acceptable fallback is the account page's banner
   linking to `/watchlist` or Discover with a text note "find it from the
   property page" — worse UX, explicitly a stopgap, not the target design.
3. **Re-access (FR13, steady state).** Property Intelligence Page's entry
   CTA (Screen 1's "View Your Report" / per-tier-card routing) is the
   permanent, always-available path back to any specific order — this is
   the real long-term access path, #1/#2 above only matter for the
   first-arrival moment right after paying.

### Layout — shared header (all states)
A compact context header renders above the state-specific body, always
present regardless of order status, so the investor is never confused about
what they're looking at (FR12):
- Property address (link → `/properties/[id]`), county/state.
- Tier display name badge.
- Purchase date (`createdAt`, formatted).
- Price paid (`pricePaidCents`, `tabular-nums`) — show upgrade-credit
  applied as a small secondary line if `upgradeCreditAppliedCents > 0`,
  matching the transparency principle used in Screen 1's credit line.
- Order status is **not** shown as a raw enum string anywhere — always
  translated into the state-specific presentation below.

### States (by `ReportOrder.status`)

**`pending_payment` (EC1/EC7 — payment never completed)**
Must not look like progress toward delivery. Render a neutral, non-alarming
"not purchased yet" state — no spinner, no "in progress" language:
> "This report hasn't been purchased yet. If you started checkout and it
> didn't complete, you can pick a tier and try again."
Primary button: **"Choose a Report Tier"** → `/properties/[id]/reports`
(uses `propertyId` already present in the `ReportOrderDto`). `role="status"`,
not `role="alert"` — this isn't an error, it's an incomplete/abandoned
action.

**`queued`**
In-progress state, distinct from `generating` (both are "not ready yet" but
queued communicates "waiting to start," not "actively working"):
> Icon/spinner (reuse `AiAnalystPanel`'s inline spinner
> `border-2 border-border-default border-t-action-primary` treatment, sized
> up slightly for a page-level state) + "Your report is queued for
> generation. This usually starts within a few minutes."
`role="status"`, `aria-live="polite"`. No fake progress bar/percentage — no
such data exists; don't fabricate precision.

**`generating`**
> Same spinner treatment + "Generating your [Tier] report for [Property
> Address]… this can take a minute." No fixed ETA number is asserted here
> (matches `AiAnalystPanel`'s existing "this can take a few seconds" —
> soft, not falsely precise) — if `be`/`arch` later expose a real estimated
> completion time, add it then; don't invent one now.
Below the message: a lightweight auto-poll (`useQuery` with a `refetchInterval`,
e.g. every 5–10s while status is `queued`/`generating`) so the investor
doesn't have to manually refresh to see `delivered` appear — this is a
behavior note for `fe`, not a visual state, included here because it's load
bearing for the state transition actually being seen. `role="status"`,
`aria-live="polite"`.

**`delivered` (FR11/FR12)**
Full report render. Below the shared context header:
- Report content rendered via the existing shared `AiAnalysisResult`
  component from `@agterra/ui` (**reused as-is**, not reimplemented) —
  `order.content` cast/validated to `AiAnalysisResultData`'s six-field
  shape (`conclusion`, `evidence`, `risks`, `confidence`, `sources`,
  `nextAction`) before passing in. If `content` doesn't match the expected
  shape (defensive case — shouldn't happen per `report-generation.service.ts`
  reusing the identical schema, but the DTO types `content` as `unknown`),
  fall back to the page-level error treatment below rather than crashing.
- Secondary actions row, placed **below** the report content (report is the
  primary artifact; actions are supporting, not competing for the same
  visual weight) — per FR16, to the extent each underlying capability
  already exists elsewhere:
  - **"Ask AI about this property"** → anchors/scrolls to (or links to) the
    Property Intelligence Page's existing `AiAnalystPanel` — this screen
    does not duplicate a second AI Q&A input; it points at the one that
    exists (avoids two divergent AI-input surfaces for the same property).
  - **"Upgrade this report"** — only rendered if a strictly-higher
    purchasable tier exists for this property tier (i.e. not shown on a
    `delivered` Professional-tier workspace). → `/properties/[id]/reports`
    (Screen 1), which will already reflect the owned-tier/credit states
    per FR4/FR5 above — no separate "upgrade" mini-flow needed here.
  - **"Watch this property"** → reuses `WatchToggle` component as-is.
  - **"Compare"** → reuses `CompareToggle` component as-is.
  - Explicitly **absent**: any PDF/download affordance (AC12) — do not add
    one, do not add a disabled placeholder for one either (a disabled
    button inviting a future feature isn't warranted by any approved
    requirement).

**`failed` (FR15)**
`role="alert"` block (this is a genuine failure, matches the `ErrorState`
severity register used elsewhere), but **not** the generic retry-button
pattern — there is nothing to retry client-side (no user-facing regenerate
action exists per this pass's scope) and the message must not promise a
refund:
> "This report couldn't be generated. This has been flagged to our team
> for follow-up — no charge has been automatically refunded. If you have
> questions, [contact Support]."
"Contact Support" → `/support` (existing Support Center,
`apps/investor-web/src/app/support/`), pre-filling context if the Support
Center's existing intake supports a prefilled subject/reference (a `fe`
implementation detail contingent on what `/support`'s form already accepts
— not asserted as required here; a plain link to `/support` is the
acceptable minimum).

**Unexpected statuses (`awaiting_review`, `approved`, `refunded`) — FR10's
"must not crash or blank-screen"**
Render a generic, honest fallback state rather than any of the above:
> "This report's status is [status] — a workspace view for this status
> isn't built yet. [Contact Support]" with the same Support link as
> `failed`. `role="status"`. This is a deliberate catch-all so an
> out-of-pass status never produces a blank page or a misleading
> "delivered"/"failed" label it doesn't actually have.

### Loading state (order fetch itself, before status is even known)
Skeleton block matching `PropertyDetailView`'s `LoadingState` convention
(`animate-pulse`, `role="status"`, visually-hidden "Loading your report…").

### Error state (order fetch fails — e.g. 404/not-yours, network error)
`GET /v1/report-orders/:id` 404s for both "doesn't exist" and "exists but
isn't yours" (service comment: intentionally indistinguishable, ownership
check baked into the query). Render exactly one state for both:
> `role="alert"`: "We couldn't find this report, or it isn't associated
> with your account." + a "Back to Discover" link (`/`) — no "Retry" button
> for a 404 specifically (retrying an identical request won't change a
> genuine 404); do show "Retry" for any other error status, matching
> `PropertyDetailView`'s `ErrorState`.

---

## Cross-Cutting

### "Unlock Report" CTA — final copy/placement summary
See Screen 1 "Entry point" table above for the full state matrix. Copy
locked in for `fe` to implement verbatim (content nits aside):
- No report owned: **"Unlock Full Report"**
- Owns lower tier, higher tier exists: **"View Your Report"** + **"Upgrade
  for deeper analysis"**
- Owns top purchasable tier: **"View Your Report"** only

### Empty/loading/error conventions — matched, not invented
- Loading: `animate-pulse` skeleton blocks, `role="status"`,
  `aria-live="polite"`, visually-hidden descriptive text — matches
  `PropertyDetailView.LoadingState` and `AiAnalystPanel`'s spinner variant.
  Use skeletons for "content structure is known but data isn't loaded yet"
  (tier cards, order header); use the inline spinner variant for "an action
  was just triggered and we're waiting on its result" (checkout creation,
  report generation) — matches the existing split between
  `PropertyDetailView`'s page-load skeletons and `AiAnalystPanel`'s
  mutation spinner.
- Error: `role="alert"`, message + "Retry" where retrying is meaningful,
  matching `PropertyDetailView.ErrorState` / `AiAnalystPanel.ErrorState`'s
  exact visual treatment (`border-risk-medium-bg`, semibold heading line,
  secondary message line, primary-styled retry button).
- Soft/expected "nothing to show yet" states (e.g. `pending_payment`,
  "not eligible") use `role="status"` in the calm `workspace-bg` card
  treatment (`AiAnalystPanel`'s `LoggedOutState`/`UpgradeState` visual
  pattern), not the alert-red treatment — reserved for genuine failures
  only (`failed` status, fetch errors).

### Accessibility
- **Focus handling, tier selection:** clicking "Select [Tier]" and entering
  the loading state must move focus to (or ensure focus remains on, with an
  `aria-live` announcement of the state change) the same button so a
  screen-reader user hears "Creating checkout…" without having to
  re-discover where they were. On redirect to Stripe, no in-app focus
  management is needed (navigation away).
- **Off-site redirect labeling:** the tier card's CTA button text should not
  claim to complete the purchase in-app — "Select [Tier] — $X" is
  acceptable (doesn't assert it's the final step), but the screen's
  intro copy should include one plain-language line stating that purchase
  is completed securely via Stripe, off-site, e.g. under the tier grid:
  *"Payment is processed securely by Stripe. You'll be redirected to
  complete your purchase."* This is a disclosure, not a confirmation step
  (see "single-click vs. confirmation" above) — it sets expectation before
  the click, not after.
- **Form/button labeling:** every tier card's primary action must have an
  accessible name that includes the tier name (not just "Select" repeated
  four times with no differentiation for assistive tech) — e.g.
  `aria-label="Select Investor tier — $99.00"` if the visible label is
  abbreviated for layout.
- **Locked/disabled Premium card:** the "Not yet available" control must
  still be reachable by keyboard/screen reader (not `display:none`'d) and
  its disabled reason must be programmatically associated (e.g.
  `aria-describedby` pointing at the "Requires analyst review…" text), not
  conveyed by a hover-only tooltip.
- **Status announcements on the workspace:** `queued`/`generating` states
  use `aria-live="polite"` regions so a screen-reader user is told when the
  page transitions to `delivered` via the auto-poll, without needing to
  re-navigate to discover it.
- **Color is never the sole signal:** the "You own this" badge, credit
  line, and disabled-Premium state all pair an icon/text label with any
  color treatment, matching the existing `OpportunityScoreBadge`/
  `DataConfidenceBadge` convention of icon+label, never color alone.

### Design System Implications
- Two new shared components needed in `packages/ui` (per
  `DESIGN-SYSTEM.md`'s own anticipated component list — "report tier card
  (pricing)" and "locked intelligence panel (price)" are already named
  there, confirming these are expected, not novel): a **Report Tier Card**
  component (handles the five CTA-state variants in the table above,
  `tabular-nums` on price/credit figures per DESIGN-SYSTEM.md's mandatory
  numeral rule) and reuse of the general locked-intelligence visual
  language for Premium's card (this doc does not mandate a new dedicated
  "locked panel" component if the Report Tier Card's own disabled-state
  variant covers it — `fe`/`arch` can decide whether that's one component
  with a state prop or two components, that's an implementation choice,
  not a UX one).
- No new color tokens required — existing `action-primary`, `text-secondary`,
  `border-subtle`, `risk-medium-bg`, `gold-accent` (Premium could
  reasonably use the existing gold-accent token given DESIGN-SYSTEM.md's
  "gold=premium" color semantic, Section 7/AC8) cover every state above.
- `AiAnalysisResult` (`@agterra/ui`) is reused unmodified for the delivered
  report body — no report-specific variant needed, confirming
  Architecture's "single shared renderer" intent holds for this new
  surface too.

### Open implementation dependencies (flagged, not resolved here)
1. **Post-purchase redirect target (Dependencies #2 in the requirements
   doc).** This design assumes the redirect will eventually carry
   `reportOrderId` (and ideally `propertyId` for the interim banner). Until
   that ships, use the interim `/account` → property-page fallback
   described above. Routed to `be`/`arch`, not resolved by this document.
2. **Upgrade-credit preview before checkout (FR4).** No existing endpoint
   returns `upgradeCreditAppliedCents` *without* creating a real
   `pending_payment` order and Stripe session (only
   `POST /properties/:id/reports/checkout` computes it, per
   `report-orders.service.ts`). This design specifies that the credit/net
   price must be visible on the tier card *before* the click (FR4's hard
   requirement) but does not mandate *how* — whether `fe` derives it from
   `GET /v1/report-tiers` + `GET /v1/properties/:id/reports` client-side
   (replicating the same `min(priorPricePaid, newBasePrice)` formula
   already implemented server-side) or whether `arch`/`be` add a
   lightweight preview endpoint is an implementation decision for those
   roles, flagged here because it affects whether FR4's "must not
   independently recompute" constraint is technically satisfiable without
   a new endpoint — escalate to `arch` before `fe` builds this specific
   card state.
