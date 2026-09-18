> Architecture decision for the two open implementation dependencies flagged
> by `docs/requirements/report-selection-purchase-and-purchased-report-workspace-ux.md`'s
> "Open implementation dependencies" section, on top of the approved
> requirements doc and the existing `apps/api/src/monetization/`
> implementation. Decisions only — implementation is `be`'s next step.

## Architectural Summary

Both gaps are small, additive changes inside the existing monetization
module — no new module, no schema change, no change to Stripe/webhook
fulfillment mechanics.

1. **Redirect (Q1):** `ReportOrdersService.createCheckout` already creates
   the `ReportOrder` row (with its final `id`) *before* it calls
   `stripe.checkout.sessions.create(...)`. That means the real `orderId`
   (and `propertyId`, already a method parameter) are both known
   synchronously, server-side, at the exact moment `success_url`/
   `cancel_url` are built. No `{CHECKOUT_SESSION_ID}` placeholder, no
   post-redirect lookup, no webhook change is needed — this was never a
   "data isn't available yet" problem, it's that `checkout-urls.ts`
   currently hands back two *static* module-level constants instead of
   building the URL per-request from data the caller already has.

2. **Pricing preview (Q2):** recommend **option (a)** — a new authenticated,
   read-only endpoint, `GET /v1/properties/:id/reports/pricing`, that
   extracts the exact same subscriber/credit formula `createCheckout`
   already uses into one shared private method, called by both the new
   endpoint and the existing checkout method. Rejected "extend
   `report-tiers.controller.ts`" (option b) — see reasoning below. No
   `data`/schema change: this reads `ReportTier`, `Subscription`, and
   `ReportOrder` rows that already exist: it duplicates zero storage and
   adds zero columns.

## Components Affected

- `apps/api/src/monetization/checkout-urls.ts` — two of its four exports
  become functions instead of constants (report-purchase ones only;
  subscription-checkout ones are untouched — out of scope, and
  `AccountWorkspace`'s `/account?checkout=success|cancelled` handling for
  subscriptions is unaffected).
- `apps/api/src/monetization/report-orders.service.ts` — `createCheckout`
  builds its `success_url`/`cancel_url` per-request; its credit-computation
  block (lines ~74–107 today) is extracted into a new shared private method
  reused by a new `previewPricing` method.
- `apps/api/src/monetization/property-reports.controller.ts` — one new
  route added alongside the existing `GET` (list) and `POST /checkout`
  routes on the same controller (same resource family, same guard).
- `apps/api/src/monetization/dto/monetization-response.dto.ts` — one new
  response DTO (`ReportPricingDto`, array element shape below).
- No change to `stripe-webhook.service.ts`, `stripe-client.service.ts`,
  `report-generation.service.ts`, or `report-tiers.controller.ts`.

## Data Flow

**Q1 (redirect):** unchanged up to and including order creation.
`createCheckout` now builds `successUrl`/`cancelUrl` from `order.id` and
`propertyId` immediately after step 6a (order created), before step 6b
(Stripe session created) — same ordering as today, just parameterized
instead of static. Stripe redirects the browser straight to
`/report-orders/[id]` on success (fulfillment status may still be
`queued`/`generating` at that instant — Screen 2's existing
`queued`/`generating` states, already designed, cover that; no race
condition is introduced, since the webhook and the browser redirect are two
independent, already-async paths today).

**Q2 (pricing preview):** `GET /v1/properties/:id/reports/pricing` runs the
same three parallel queries `createCheckout` already runs (`subscription`,
`deliveredOrders` for `(propertyId, ctx.scopeId)`, `allTiers`), computes
per-tier pricing/credit via the shared method, and returns immediately — no
write, no Stripe call, no `ReportOrder` row created. Tier-selection screen
calls this once on load (alongside its existing `GET /v1/report-tiers` and
`GET /v1/properties/:id/reports` calls) for authenticated users only, same
pattern as `WatchToggle`'s `enabled: !!user`. Logged-out users never call
it — they see `GET /v1/report-tiers`' public non-subscriber prices only,
which is already correct per the UX spec's logged-out banner copy (no
credit can apply with no purchase history to check).

## API Changes

### Q1 — no new endpoint; internal URL construction changes only

`checkout-urls.ts` changes shape for report purchases only:

```ts
// before
export const REPORT_CHECKOUT_SUCCESS_URL = `${FRONTEND_URL}/account?checkout=success`;
export const REPORT_CHECKOUT_CANCEL_URL = `${FRONTEND_URL}/account?checkout=cancelled`;

// after
export function buildReportCheckoutSuccessUrl(reportOrderId: string): string {
  return `${FRONTEND_URL}/report-orders/${reportOrderId}?checkout=success`;
}
export function buildReportCheckoutCancelUrl(propertyId: string): string {
  return `${FRONTEND_URL}/properties/${propertyId}/reports?checkout=cancelled`;
}
```

`createCheckout` calls `buildReportCheckoutSuccessUrl(order.id)` /
`buildReportCheckoutCancelUrl(propertyId)` when building the `stripe.checkout.sessions.create(...)`
call (step 6b), instead of referencing the old static constants.

Cancel target: routes back to the tier-selection screen for the same
property (`/properties/:id/reports`) rather than `/account` — the investor
was mid-purchase-flow for a specific property; sending them back to that
same screen (which the UX doc's own Screen 1 spec already handles — no
special "cancelled" state needed there beyond the normal default state) is
strictly better than a generic account page and costs nothing extra to
build, since `propertyId` is equally available at this call site. Flag this
one small addition beyond the literal Q1 ask to `be`/`ux` — if `ux` prefers
`/account?checkout=cancelled` preserved as-is for cancellation specifically
(distinct from success), that's a one-line change to which builder function
is used; not asserting it over `ux`'s existing design, just noting the
option since the data is already there for free.

Subscription checkout (`SUBSCRIPTION_CHECKOUT_SUCCESS_URL`/`_CANCEL_URL`) is
untouched — stays exactly as-is, still pointing at `/account`, out of scope
per this task's boundary.

### Q2 — new endpoint

```
GET /v1/properties/:id/reports/pricing
Auth: JwtAuthGuard (same as the existing GET/POST on this controller)
```

Added to `PropertyReportsController` (same controller as the existing
`GET` list and `POST /checkout` routes — same resource, same guard, no new
controller file needed).

Response — `ReportPricingDto[]`, one element per seeded `ReportTier`,
ordered by `sortOrder` (matches `GET /v1/report-tiers`' existing ordering
convention so `fe` can zip the two responses by index/`code` without
resorting):

```ts
export interface ReportPricingDto {
  tierCode: string;             // "essential" | "investor" | "professional" | "premium"
  displayName: string;
  purchasable: boolean;         // false only for premium — mirrors ReportTierDto.purchasable
  priceCents: number;           // this investor's applicable base price (subscriber or non-subscriber)
  priceBasis: "subscriber" | "non_subscriber";
  upgradeCreditAppliedCents: number; // 0 if no lower delivered tier owned on this property
  netPriceCents: number;        // max(priceCents - upgradeCreditAppliedCents, 0) — this is what checkout will charge if this exact tier is selected next
}
```

This is a strict superset of the four fields FR4 requires ("tier code,
price shown to this investor, applicable credit if any, net price") plus
`purchasable`/`priceBasis`, which the tier-selection screen already needs
to render the banner/Premium-lock states and would otherwise have to
source from a second response (`GET /v1/report-tiers`) and cross-reference
by hand — cheap to include, removes a merge step on the frontend, and adds
no new computation (`purchasable` is `!tier.requiresHumanReview`, already
computed identically in `report-tiers.controller.ts`).

**Deliberately excluded:** a per-tier `alreadyOwned` boolean. `fe` still
needs `GET /v1/properties/:id/reports` regardless, to resolve the specific
`orderId` each "View Your Report" card routes to (per the UX doc's
explicit requirement that each tier's card routes to *that tier's own*
order, not "most recent"/"highest"). Computing ownership in two places from
two independently-evolving queries risks the classic dual-source-of-truth
drift; `fe` derives "already owned at tier X" client-side from that
existing, already-required response (`orders.some(o => o.status ===
'delivered' && tierSortOrder[o.reportTierCode] >= tierSortOrder[X])`) —
one small, obviously-correct client computation against data it's already
holding, not a second server-side ownership check to keep in sync with
the first.

Why not extend `report-tiers.controller.ts` (rejected option b): that
endpoint is deliberately public/unauthenticated (`@Controller("report-tiers")`,
no guard, no `AccountContext` in its signature) and its response is
identical for every caller — it's cacheable pricing-page data by design.
Bolting per-investor credit computation onto it would either force it
behind a guard (breaking every current public caller/contract, including
the logged-out tier-selection view this same UX doc specifies) or require
an ad hoc "guard optional, personalize if present" pattern this codebase
has never used anywhere (confirmed: no `OptionalJwtAuthGuard`/equivalent
exists in `apps/api/src/identity-access/`) — inventing that pattern for
one endpoint is a bigger, riskier change than adding one authenticated
route to a controller (`PropertyReportsController`) that is *already*
authenticated, already property-scoped, and already contains the sibling
"purchase-adjacent" routes (`list`, `checkout`) this belongs next to.

## Database Changes

None. Confirmed: both changes read `ReportTier`, `Subscription`, and
`ReportOrder` rows that already exist via existing Prisma models; no new
table, column, index, or migration required for either question.

## Authentication / Authorization

- Q1: no change — the checkout endpoint's existing `JwtAuthGuard` and
  `AccountContext` scoping are untouched; only the two URL strings it
  builds change.
- Q2: new endpoint uses the exact same `JwtAuthGuard` +
  `@CurrentAccountContext()` pattern as every other route on
  `PropertyReportsController` — ownership/credit computation is scoped by
  `ctx.scopeId` in the query itself, identical to `createCheckout`'s
  existing pattern (no "fetch then filter" risk).

## Integration Changes

None beyond the two items above. No Stripe API surface touched (Checkout
Session creation call shape is unchanged — only the two URL string
arguments passed into it change), no webhook event handling touched. The
`success_url`/`cancel_url` Stripe accepts are plain URLs Stripe redirects
the browser to verbatim after checkout; no Stripe-side placeholder
substitution (`{CHECKOUT_SESSION_ID}`) is needed or used, since we don't
need anything Stripe only produces later — `reportOrderId` was already ours
before the Stripe call was ever made.

## Shared Components

`report-orders.service.ts` gains one new private method (suggested name:
`computeTierPricing(ctx, propertyId): Promise<ReportPricingDto[]>`) that
generalizes the existing single-tier credit-computation loop in
`createCheckout` (today: computed once, for the one requested tier) to run
per-tier across all four seeded tiers. `createCheckout` then calls
`computeTierPricing`, picks the entry matching the requested `tier`, and
uses its `priceCents`/`priceBasis`/`upgradeCreditAppliedCents`/
`netPriceCents` instead of recomputing them inline — this is the "single
source of truth, no duplicated formula" requirement from Q2's prompt,
satisfied by construction rather than by convention/comment. The new
preview endpoint calls the same method directly. No other module depends
on this method.

## Security Considerations

- Q1: cancel/success URLs are built from `order.id` (a server-generated
  UUID, never client input) and `propertyId` (already validated via
  `ParseUUIDPipe` + `propertiesService.getPropertyById` earlier in the same
  method) — no injection/open-redirect surface introduced; both are
  interpolated into a fixed `${FRONTEND_URL}/...` template, not
  user-suppliable strings.
- Q2: read-only, no side effects, no new data exposed beyond what the
  investor's own already-accessible endpoints (`report-tiers`, their own
  `report-orders`) already reveal about their own account — same
  ownership-scoping guarantee as every other route on this controller.

## Performance Considerations

Both changes are cheap. Q1 adds no new query. Q2 adds one new endpoint
whose query cost is identical to the credit-computation portion of
`createCheckout` (two additional round trips already paid on every
checkout call today: `subscription` lookup + `deliveredOrders` query,
both indexed on their respective FKs) — called once per tier-selection
page view, not per interaction. No caching need identified at this volume;
revisit only if pricing-page traffic ever becomes a measured bottleneck.

## Migration Plan

No data migration. Deploy order: ship the `be` changes (both) in one PR —
they're small, in the same file, and Q1 has zero frontend dependency (the
backend can start returning the new URLs before `fe` builds Screen 2's
routing, since `/report-orders/[id]`'s route already needs to exist per
the UX doc regardless of when the redirect starts pointing at it — but
sequence `fe`'s Screen 2 build before flipping this redirect live in an
environment investors can hit, so a real purchase never redirects to a
404). Q2's endpoint is purely additive — no consumer exists yet until `fe`
builds Screen 1's pricing-preview call, so it can ship any time before or
after `fe`'s work starts with no compatibility risk.

## Implementation Constraints

- Do not touch `stripe-webhook.service.ts` — confirmed neither question
  requires it; `handleReportCheckoutCompleted` already resolves
  `reportOrderId` from `session.metadata`, which is unrelated to
  `success_url`/`cancel_url` and is set separately (`metadata:
  { reportOrderId: order.id }` in `createCheckout`, unchanged by this
  work).
- Reuse `computeTierPricing` for both `createCheckout` and the new preview
  endpoint — do not implement the formula twice. This is the specific,
  load-bearing constraint the requirements doc's FR4 ("must not
  independently recompute or estimate this value") depends on being true
  at the code level, not just the API-contract level.
- Keep `GET /v1/report-tiers` public and unauthenticated, unchanged — do
  not add per-user personalization to it (see "API Changes" rationale
  above).
- `fe` derives per-tier "already owned" client-side from the existing
  `GET /v1/properties/:id/reports` response (already required for
  order-id routing) — do not add a server-side `alreadyOwned` field to the
  new pricing DTO; that would create a second, independently-computed
  source of the same fact.
- The cancel-URL destination change (`/account` → `/properties/:id/reports`)
  is a small addition beyond the literal Q1 ask; if `ux`/PO prefer to keep
  `/account?checkout=cancelled` for cancellations specifically, that's a
  one-line swap in `buildReportCheckoutCancelUrl`'s body — flagged for
  confirmation, not blocking.
