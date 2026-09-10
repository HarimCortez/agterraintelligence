# AgTerra Intelligence — Architecture Baseline

> Source: `REQUIREMENTS.md` (PM-approved requirements baseline, 2026-09-08).
> Produced by the `arch` function of the AI Software Development Team operating model. This is controlled input for `data`, `be`, `fe`, and `ai-engineer` — treat it as approved, not a proposal to re-derive.

## Architectural Summary

AgTerra Intelligence is architected as a **modular monolith** (not microservices) for MVP: one deployable NestJS backend organized into clearly bounded domain modules, backed by PostgreSQL/PostGIS as the system of record, OpenSearch as a derived search/filter index, Redis for caching and background job orchestration, and S3-compatible object storage for documents and imagery. Two separate Next.js frontends (investor app + admin console) consume the same API through role-scoped authentication planes.

The rationale for a modular monolith over microservices: this is a single greenfield build with a large *feature* surface (19 screens across 2 planes) but a *team* that has to deliver all of it before any module has proven independent scaling needs. A monolith with strict internal module boundaries (mirroring the domain breakdown below) gives velocity now and a clean extraction path later — any module that turns out to need independent scaling (ingestion, AI, report generation are the likely first candidates) can be pulled out into its own service without a rewrite, because it is already isolated behind a service-layer interface, not entangled with HTTP controllers or other modules.

Two of the four Product-Owner-confirmed decisions are structural, not incidental, and shape this architecture from the ground up: (1) every account-scoped query and permission check is written against an `AccountContext` abstraction that resolves to a user today and will resolve to an org tomorrow, so the org layer is a data/config change, not a rewrite; (2) report fulfillment is built as an explicit state machine with an `awaiting_review` state from day one, so Premium's human-in-the-loop requirement is a routing rule inside an existing pipeline, not a bolted-on special case.

## Components Affected

Initial system decomposition (NestJS modules on the backend, mirrored by frontend feature areas):

1. **Identity & Access** — investor auth, admin auth (separate plane), RBAC/entitlement resolution, `AccountContext` (org-seam abstraction).
2. **Property & Geospatial Data Platform** — ingestion adapters (listings, county records, USDA/NRCS soils, FEMA flood, wetlands, satellite imagery), canonical property model, geospatial reference layers, data-confidence tagging, dedup/QA pipeline.
3. **Scoring & Valuation Engine** — Opportunity Score computation, valuation/discount modeling, comparables selection.
4. **AI Layer** — context assembly, structured response generation (Conclusion→Evidence→Risks→Confidence→Sources→Next-action), guardrails, retrieval/grounding, AI interaction logging.
5. **Monetization** — subscription plans, report-tier catalog and pricing engine (subscriber/non-subscriber differential), entitlements, upgrade-credit logic, payments integration.
6. **Report Fulfillment** — generation pipeline state machine, automated rendering (Essential/Investor/Professional), human review queue (Premium), PDF generation, delivery/email.
7. **Investor Workspace (frontend)** — 10 investor screens + persistent comparison tray + AI Analyst Drawer.
8. **Admin Console (frontend)** — 9 admin modules, separate app/deployment.
9. **Engagement Services** — watchlists, saved searches, alert evaluation and notification.
10. **Analytics & Audit** — event instrumentation (behavior/monetization/quality), audit log, admin reporting feeds.
11. **Support/Ticketing** — ticket workspace, order/property context linking.
12. **Platform/DevOps** — IaC, observability, feature flags, config, maintenance mode.

**Build sequence** (what gets built first, and why):

- **Phase 0 — Foundations.** Infra-as-code, CI/CD, monorepo scaffold, Identity & Access module (both auth planes + `AccountContext`), core DB schema (accounts, organizations, properties skeleton), shared UI package skeleton. Everything downstream depends on the account/permission model and the org-seam being right the first time — this is the highest-cost-to-retrofit piece in the whole system.
- **Phase 1 — Data spine.** Geospatial ingestion for FL parcels/listings plus one authoritative source each for soils/flood/wetlands/imagery; canonical property model; OpenSearch sync. Nothing investor-facing is meaningful without real property data.
- **Phase 2 — Discovery & Property Intelligence.** Discover + Map Workspace, Property Intelligence Page, Opportunity Score v1 (explainable/rules-based before any ML), comparables v1.
- **Phase 3 — Monetization core.** Subscription plans, report-tier catalog/pricing/entitlement engine (subscriber/non-subscriber differential + upgrade credit), Stripe integration, Report Selection & Purchase screen. Admin Billing/Entitlements module ships alongside this, not later — it's the operational counterpart to the same tables.
- **Phase 4 — Report fulfillment.** Fulfillment state machine, automated generation (Essential/Investor/Professional), Premium review queue, PDF generation, Purchased Report Workspace. Admin Report Fulfillment module ships alongside this.
- **Phase 5 — AI layer.** Structured response service, summarization/thesis/Q&A, AI Analyst Drawer, guardrails. Admin AI & Model Monitoring module ships alongside this (the monitoring hooks should be built into the AI service from day one, not retrofitted).
- **Phase 6 — Engagement.** Watchlist + Alerts, Saved Searches, Comparison Workspace, Portfolio Workspace (pending PO confirmation of MVP status — see Open Architecture Questions / carried-forward PRD Open Question 10).
- **Phase 7 — Remaining admin modules.** Data Sources & Ingestion Monitor (can start earlier, tied to Phase 1), Support Center, Content & Data Quality, Revenue Analytics, Administration Settings/Audit Logs.
- **Phase 8 — Hardening.** Security review, load testing on geospatial/search paths, accessibility pass, analytics-completeness audit against Section G, legal/disclaimer copy integration (pending legal dependency).

Note: admin modules are deliberately *not* treated as a single big-bang phase at the end — each admin module is the operational twin of an investor-facing capability and should ship in the same phase as the data/domain it operates on. Building them last would mean launching monetization or fulfillment with no operational tooling to run it.

## Data Flow

**Ingestion (write path, external → canonical):** scheduled or webhook-triggered jobs per source adapter → raw payload landed in a staging table/object (`property_data_sources.raw_payload`) with source + confidence tag → normalization/validation → dedup against existing `properties` by parcel ID/geometry → canonical property record upsert → geospatial enrichment (spatial join against soils/flood/wetlands reference layers) → Opportunity Score + valuation recompute queued (async) → OpenSearch index sync (via outbox/CDC, not dual-write) → watchlist/saved-search alert evaluation queued for any matching criteria.

**Investor read path:** browser → CDN → Next.js (investor app) → API gateway (NestJS) → auth middleware resolves `AccountContext` → domain service → reads from OpenSearch (search/filter/facet queries) or Postgres (single-property, transactional reads) → response. Map tile requests go directly to the GIS/imagery provider (not proxied through the app backend) except for AgTerra-specific overlays (score markers, comps, ownership), which are served from the API.

**AI Q&A / generation path:** user question (with context: property/report/comparison/search/portfolio) → context assembly service pulls relevant records with their confidence tags intact → retrieval step (pgvector similarity) pulls grounding passages (comparables, report sections, data-source citations) → LLM call with schema-constrained output enforcing Conclusion/Evidence/Risks/Confidence/Sources/Next-action → guardrail post-processor (banned-language check, legal-topic detector, confidence-floor enforcement) → response persisted to `ai_interactions` → returned to client. Every AI response is logged with the model version and the exact context payload used, for both audit and AI-monitoring purposes.

**Report purchase → fulfillment path:** purchase request → pricing engine resolves price by (tier, current subscription status) → payment processed → `report_orders` row created (`status = queued`) and entitlement granted → fulfillment worker picks up job → Essential/Investor/Professional render synchronously through the templated generation pipeline (`generating` → `delivered`) → Premium routes to `awaiting_review` → appears in admin Report Fulfillment review queue → analyst approves/edits → `delivered` → PDF generated, email sent, audit log entry written. Failures at any stage set `status = failed` and surface in the admin Report Fulfillment "failed reports" view for resend/refund.

## API Changes

Greenfield API surface — REST + OpenAPI as the primary contract (GraphQL was considered and rejected for MVP: the screens are mostly purpose-built views with predictable data needs, not ad-hoc client-driven queries, so REST's simpler caching/versioning/observability story wins; this can be revisited if the frontend team hits real over/under-fetching pain). Versioned under `/v1`. Bearer JWT auth (access + rotating refresh token), separate token issuer/audience for the admin plane.

Resource groups (domain-level, not exhaustive):

- `/v1/auth/*` — investor login/register/refresh/logout
- `/v1/admin/auth/*` — separate admin login (MFA-gated), isolated from investor auth
- `/v1/accounts/*` — profile, `AccountContext` resolution
- `/v1/properties/*`, `/v1/properties/{id}/score`, `/v1/properties/{id}/valuation`, `/v1/properties/{id}/comparables`, `/v1/properties/{id}/risks`
- `/v1/search` — the primary geospatial + faceted query endpoint backing Discover + Map (bbox/polygon filter, layer toggles, sort by score, pagination)
- `/v1/comparisons/*` — create/save/export comparison sets (2–6 properties)
- `/v1/watchlist/*`, `/v1/saved-searches/*`, `/v1/alerts/*`
- `/v1/subscriptions/*`, `/v1/report-tiers`, `/v1/report-orders/*`, `/v1/entitlements/*`
- `/v1/ai/ask` (supports streaming response), `/v1/ai/interactions/{id}/feedback`
- `/v1/portfolio/*`
- `/v1/admin/{billing|fulfillment|ingestion|support|data-quality|ai-monitoring|revenue|settings|audit-log}/*` — one namespace per admin module, each independently permissioned
- `/webhooks/payments` (Stripe), `/webhooks/ingestion/{source}` (for push-style source vendors)

Even though the institutional API is explicitly out of MVP scope, the internal API must be layered (HTTP controllers thin, business logic in injectable services) specifically so that a future public/institutional API can wrap the same service layer later without a rewrite — this is the concrete implementation consequence of Product Decision #2 and should not be read as "skip API design discipline because it's not customer-facing yet."

## Database Changes

Primary engine: **PostgreSQL + PostGIS**. Core schema below (columns are representative/sufficient for `data` to implement from, not exhaustive DDL).

**Identity & accounts (org-seam is here):**
- `organizations` (id, name, billing_account_id, status, created_at) — table exists and is populated by nothing in MVP except future migration; present now so account re-parenting never requires a schema rewrite.
- `users` (id, email, password_hash, external_role enum[free, basic_subscriber, investor_subscriber, professional_subscriber, institutional, team_admin, team_member], **org_id nullable FK → organizations.id**, status, created_at, updated_at). `org_id` is null for every MVP user. `team_admin`/`team_member` are dormant enum values — they only become meaningful once a user's `org_id` is populated; no special-case logic is needed for them now, but the enum values ship today so no migration is needed when org support activates.
- `admin_users` (id, email, password_hash, internal_role enum[super_admin, admin, support_agent, data_qa_reviewer, report_fulfillment_manager, billing_manager, ai_model_monitor, readonly_analyst], mfa_secret, status, created_at) — intentionally a **separate table**, not a role flag on `users`, to keep the admin auth plane isolable.
- `role_permissions` (role, permission_key, allowed boolean) — policy table driving admin RBAC checks (billing actions, refunds, data edits, AI/model settings, audit-log access) rather than hardcoded per-role branching in code.

**Properties & geospatial:**
- `properties` (id, external_source_id, county, state, parcel_id, address, location geography(Point,4326), boundary geography(Polygon,4326), acreage, asking_price_cents, price_per_acre_cents, listing_status, land_use_type, created_at, updated_at) — GIST index on `location` and `boundary`.
- `property_data_sources` (id, property_id FK, source_type enum[listing, county_record, soils, flood, wetlands, imagery, market], source_name, raw_payload jsonb, ingested_at, confidence enum[verified, modeled, ai_inferred, unknown]) — the field-level confidence record required by Section 7.2/DoD #7.
- `property_valuations` (id, property_id FK, estimated_value_cents, value_range_low_cents, value_range_high_cents, discount_pct, methodology text, confidence_level enum, computed_at).
- `opportunity_scores` (id, property_id FK, score int, band enum[exceptional, strong, promising, watch, limited], component_breakdown jsonb, model_version, computed_at).
- `comparables` (id, property_id FK, comparable_property_id FK nullable, external_comp_payload jsonb nullable, similarity_score, deltas jsonb).
- `property_risk_flags` (id, property_id FK, risk_type, severity enum, description, source, created_at).
- Reference geospatial layers (ingested, not user-editable, joined by spatial intersection not FK): `county_boundaries`, `soil_map_units` (SSURGO), `flood_zones` (FEMA), `wetland_areas` (NWI) — each with a `geometry`/`geography` column and GIST index.

**Monetization:**
- `subscription_plans` (id, tier enum[free, basic, investor, professional, institutional], price_cents, billing_interval, entitlements jsonb, active).
- `subscriptions` (id, user_id FK, plan_id FK, status, current_period_start, current_period_end, payment_provider_subscription_id, created_at).
- `report_tiers` (id, code enum[essential, investor, professional, premium], **subscriber_price_cents**, **non_subscriber_price_cents**, contents jsonb, requires_human_review boolean). Two price columns, not one price plus a discount percentage — see Implementation Constraints #4 for why this is a hard requirement, not a modeling preference.
- `report_orders` (id, user_id FK, property_id FK, tier_id FK, price_paid_cents, price_basis enum[subscriber, non_subscriber], upgrade_credit_applied_cents, payment_provider_txn_id, **status enum[pending_payment, queued, generating, awaiting_review, approved, delivered, failed, refunded]**, created_at, delivered_at).
- `report_entitlements` (id, user_id FK, property_id FK, tier_id FK, report_order_id FK, granted_at, expires_at nullable).
- `report_documents` (id, report_order_id FK, file_url, file_type, version, generated_at).
- `report_review_queue` (id, report_order_id FK, assigned_admin_id FK nullable, status enum[pending, in_review, approved, rejected], notes, reviewed_at) — the human-in-the-loop seam required by Product Decision #3.
- `payment_transactions` (id, user_id FK, type enum[subscription, report_purchase, refund], amount_cents, provider_txn_id, status, created_at).

**Engagement:**
- `watchlist_items` (id, user_id FK, property_id FK, added_at, alert_config jsonb).
- `saved_searches` (id, user_id FK, name, criteria jsonb, alert_enabled boolean, last_run_at, created_at).
- `alerts` (id, user_id FK, property_id FK nullable, watchlist_item_id FK nullable, saved_search_id FK nullable, alert_type, payload jsonb, read_at, created_at).
- `comparisons` (id, user_id FK, property_ids jsonb, created_at) — persisted on explicit "save comparison," not every tray interaction.
- `portfolio_properties` (id, user_id FK, property_id FK, acquisition_price_cents, acquisition_date, current_value_cents, income_estimate_cents, notes).
- `portfolio_tasks` (id, portfolio_property_id FK, task_type, status, due_date).

**AI, support, audit:**
- `ai_interactions` (id, user_id FK, context_type enum[property, report, comparison, search, portfolio], context_id, question, response jsonb [conclusion, evidence, risks, confidence, sources, next_action], model_version, created_at, feedback enum nullable).
- `support_tickets` (id, user_id FK, subject, status, priority, related_order_id FK nullable, related_property_id FK nullable, created_at).
- `support_ticket_messages` (id, ticket_id FK, sender_type, body, internal_note boolean, created_at).
- `data_quality_flags` (id, property_id FK, flag_type enum[duplicate, missing_field, disputed], status, raised_by, resolved_by, resolved_at).
- `ingestion_jobs` (id, source_type, status, started_at, completed_at, records_processed, records_failed, error_log).
- `audit_log` (id, actor_type enum[user, admin, system], actor_id, action, entity_type, entity_id, before jsonb, after jsonb, ip_address, created_at) — append-only; application DB role has no UPDATE/DELETE grant on this table.

## Authentication / Authorization

Two fully separate authentication planes: investor (`users`) and admin (`admin_users`), with separate login endpoints, separate JWT issuer/audience, and separate session lifetimes (admin sessions shorter-lived, MFA-required). This is a deliberate blast-radius decision — a compromised investor session should never be able to reach an admin endpoint, and vice versa, regardless of any application-layer bug.

**External RBAC (7 roles):** resolved primarily from `subscriptions.plan_id` (drives feature entitlements like AI Analyst access, exports, advanced filters) plus explicit `report_entitlements` rows for per-property report access. Locked-content gating (Section 8.2) is enforced at the API layer — an unentitled request for report content never receives the full payload, only the teaser/explainer shape, so there's no reliance on the frontend to hide anything.

**Internal RBAC (8 roles):** resolved via the `role_permissions` policy table against explicit permission keys (e.g. `billing.refund`, `data.edit`, `ai_settings.write`, `audit_log.read`). This is intentionally table-driven rather than code-branched, because Section F/DoD #4 requires permission enforcement across a large and growing set of discrete admin actions (billing, refunds, data edits, AI/model settings, audit logs, support, content QA) — a policy table lets `data`/`be` add new permission keys without redeploying permission logic.

**Org-seam requirement:** all account-scoped authorization and data queries must go through an `AccountContext` abstraction that resolves "effective account" as `org_id` if present, else the user themself. No module should query `WHERE user_id = :currentUser` directly as its sole tenant boundary — it should query through `AccountContext.scopeId`. Today `scopeId == user.id` for everyone; when the org layer activates, this becomes a data change (populate `org_id`) rather than a code change across every module that does tenant-scoped queries. This is the direct technical fulfillment of Product Decision #1.

## Integration Changes

Every external integration sits behind an adapter interface local to its domain module — this is a direct consequence of the PRD explicitly deferring vendor selection (Open Question 5): the architecture must not assume any specific vendor survives to launch.

- **Listings feed(s):** per-source connector normalizing to canonical `property_data_sources` payload shape; scheduled pull or webhook depending on vendor capability.
- **County records:** per-county adapter (Florida counties vary widely in data format/API maturity — see Open Architecture Questions #4); common adapter contract (`fetch → normalize → confidence-tag`) regardless of per-county implementation differences underneath.
- **USDA/NRCS soils (SSURGO):** bulk download + periodic sync into `soil_map_units`; joined to properties by geometry intersection, not stored per-property.
- **FEMA flood zones:** public bulk shapefile/API ingestion into `flood_zones`, same spatial-join pattern.
- **Wetlands (NWI):** same pattern into `wetland_areas`.
- **Satellite/aerial imagery:** tile provider integrated at the map-rendering layer (client fetches tiles directly from provider, not proxied through the backend); only AgTerra-specific overlays are backend-served.
- **Maps/GIS provider:** Mapbox GL JS (see stack section) — abstracted behind an internal map-layer config so overlay definitions (soil, flood, wetlands, zoning, comps, score markers) are data-driven, not hardcoded per provider.
- **Payments:** Stripe, accessed only through a `PaymentsService` interface — no Stripe SDK calls outside that module.
- **Email delivery:** transactional provider (Postmark recommended) behind a `NotificationsService`.
- **PDF generation:** internal headless-rendering worker (see stack section), not a third-party PDF API, to keep report layout in the same design-system components as the web view.
- **Analytics tracking:** single instrumentation point (Segment) fanning out to product analytics + warehouse destinations, so the three required event categories (behavior/monetization/quality, Section G) are captured once and routed, not instrumented three separate times.

## Shared Components

The Section E reusable-component list maps to an internal `packages/ui` design-system package (used by both the investor and admin Next.js apps), organized as:

- **Shell/navigation:** application shell, nav sidebar (dark rail per Section 7).
- **Data display:** KPI card, property card, property table, investment metric card, comparison table, watchlist table, audit-log row — all built on a shared virtualized-table primitive given the "data-dense tables" requirement.
- **Status/semantics:** Opportunity Score badge, risk badge, entitlement badge, admin status badge, data-source health indicator — all consuming a shared color-semantics token set (green=opportunity/agriculture, gold=premium, amber/red=risk, blue=info/action) so the color system can't drift screen to screen.
- **Map:** map marker, map preview card — thin wrappers around the Mapbox layer config described above.
- **Commerce:** report tier card, locked intelligence panel, comparison tray (persisted client-side and rehydrated app-wide per the "persistent across the app" requirement).
- **AI:** AI analyst drawer, source transparency drawer, and one **structured AI response renderer** that is the single place the Conclusion/Evidence/Risks/Confidence/Sources/Next-action pattern is rendered — every AI surface (drawer, report Q&A, portfolio recommendations) consumes this one component rather than each screen reimplementing the pattern.
- **Ops:** support ticket panel, filter panel, active filter chip, saved search card, alert card, report contents panel.

Two of these are called out specifically because they carry business rules that must never be bypassed by a screen-specific shortcut: the **locked intelligence panel** (must never fully hide or fully expose gated content — Section 8.2) and the **AI response renderer** (must never render an AI answer that skips a required section, especially Confidence or the legal-verification next-action). Both should be built and tested once, centrally, not duplicated.

## Security Considerations

- **Admin/investor plane isolation** (separate auth, separate JWT audience, separate session TTL/MFA policy) — already covered above; this is the primary defense against privilege escalation between the two role systems.
- **No card data touches app servers** — Stripe Checkout/Elements only, keeping AgTerra at PCI SAQ-A.
- **Report content delivery** via short-TTL signed URLs to S3, not public object URLs.
- **Audit log is append-only** at the database-role level (no UPDATE/DELETE grant), not just by application convention.
- **Danger-zone/maintenance-mode admin actions** (Administration Settings, Section 6.9) require step-up confirmation, are restricted to Super Admin, and are themselves audit-logged with actor and before/after state.
- **AI prompt-injection surface from ingested content:** raw ingested text (listing descriptions, county record free-text fields) flows into AI context assembly for summarization/thesis-generation. This is a real injection vector — adversarial or malformed text in scraped source data could attempt to manipulate AI output. Ingested free-text fields must be sanitized/delimited as untrusted data at the context-assembly boundary before reaching any LLM prompt, and the guardrail post-processor must not be bypassable by content that arrived via ingestion.
- **Rate limiting on AI endpoints** for cost control and abuse prevention, independent of the (deferred) institutional API rate-limiting work.
- **Tenant isolation via `AccountContext`** is enforced even though MVP is single-user, precisely so it's already correct when multi-user orgs exist.
- **Secrets** via cloud secrets manager, never committed or in plain env files in the repo.

## Performance Considerations

- **Geospatial queries:** GIST indexes on all `geography`/`geometry` columns; map rendering uses precomputed vector tiles (not raw per-request geometry queries) for boundary/overlay layers at pan/zoom scale.
- **Search/filter/sort at map+dashboard scale:** served from OpenSearch, not primary Postgres, with async sync from Postgres via outbox/CDC — keeps the transactional path (purchases, entitlements) insulated from search-load spikes.
- **Score/valuation computation is asynchronous**, never computed inline on a read request; `opportunity_scores`/`property_valuations` are read-cached rows recomputed by background jobs on data change.
- **Report generation and PDF rendering run as background jobs**, never blocking the purchase request/response cycle.
- **AI responses stream** to the client for perceived latency in the AI Analyst Drawer; retrieval-based grounding (pgvector) is used instead of large-context stuffing to keep both latency and cost bounded.
- **Admin analytics (Revenue Analytics, cohort/retention queries) reads from a Postgres read replica**, not the primary OLTP instance, once volume justifies it — flagged now so `data` doesn't have to retrofit connection routing later.
- **Data-dense tables** (admin and investor) are paginated/virtualized by default, not rendered as full unbounded lists.

## Migration Plan

Greenfield build — "migration" here means environment progression and initial data bootstrap, not migrating off an existing system.

- **Environments:** dev → staging → production, provisioned via Terraform (IaC) from day one so environment drift doesn't accumulate before launch.
- **Monorepo bootstrap:** Turborepo + pnpm workspaces (`apps/web`, `apps/admin`, `apps/api`, `packages/ui`, `packages/shared-types`, `packages/db`).
- **Initial data bootstrap:** before any user-facing query is meaningful, the ingestion pipeline must complete a historical/bulk load for the selected initial Florida counties (listings, parcels, soils, flood, wetlands) — this bulk load is the closest equivalent to a "migration" step and should be treated as a release gate, not an ongoing background nicety, for the alpha milestone.
- **Rollout stages:** internal alpha (single FL county, seed/bootstrap data, team-only access) → limited beta (subset of real investors, manual QA on data quality and AI response compliance) → Florida MVP GA.
- **Schema migrations** managed through a standard forward-only migration tool (e.g. Prisma Migrate or equivalent tied to the chosen ORM) from the first commit, with the org-seam tables (`organizations`, `users.org_id`) present in the very first schema migration rather than added later.

## Implementation Constraints

The four confirmed Product Owner decisions each create a specific, non-negotiable technical obligation. These are not general guidance — they are binding constraints on `data`/`be`/`ai-engineer` implementation:

1. **Org seam (Decision 1):** `users.org_id` (nullable FK → `organizations.id`) and the `organizations` table must exist in the schema from the first migration, not be deferred. All account-scoped authorization and queries must route through the `AccountContext` abstraction (resolves to org if present, else self) rather than querying `user_id` directly as the sole tenant boundary. `team_admin`/`team_member` role enum values ship now but require no active logic until `org_id` is populated.
2. **No institutional API in MVP (Decision 2):** do not build public-API auth, versioning, or rate-limiting infrastructure now. Do keep the internal service layer cleanly separated from HTTP controllers, specifically so a future public API can wrap existing services without a rewrite. This is a "keep the door open," not "build the door," instruction.
3. **Human-in-the-loop Premium reports (Decision 3):** `report_orders.status` must include `awaiting_review` as a first-class state, and **all** report tiers — not just Premium — must flow through the same fulfillment state machine (`queued → generating → [awaiting_review →] delivered`, with `failed`/`refunded` branches). Essential/Investor/Professional simply skip the review state; they must not be implemented as a structurally different (synchronous generate-and-return) code path from Premium, because that would make it hard to ever route another tier through review later.
4. **Subscriber/non-subscriber pricing differential (Decision 4):** `report_tiers` must carry two independent price columns (`subscriber_price_cents`, `non_subscriber_price_cents`), not one price plus a discount percentage, since deltas may be tier-specific and non-linear. Purchase-time pricing must resolve against the buyer's subscription status *at time of purchase*. Upgrade-credit computation must be based on the price actually paid (`report_orders.price_paid_cents`), not tier list price, so the credit is correct regardless of which price basis the original purchase used. `ux`'s "upgrade to save" recommendation logic depends on both price columns being queryable together — do not collapse them into a single derived field.

**General constraints:** desktop-first responsive design (not mobile-first) per Section F; the non-goal constraints (no escrow/lending/title/brokerage functionality, no outcome guarantees) apply to every module including anything AI-generated — this is an architectural boundary, not just a copy/legal concern, meaning no module should be designed with a data model or workflow that implies AgTerra holds funds, title, or makes binding determinations.

## Recommended Technology Stack

| Layer | Choice | Justification (tied to requirement) |
|---|---|---|
| Frontend framework | **Next.js (React, TypeScript), App Router** | Desktop-first, data-dense, map-heavy app with many drawers/modals (Section F) benefits from Next.js's SSR/ISR for dashboard-style pages plus a mature ecosystem for map/table-heavy UIs and a large hiring pool for a multi-quarter build. |
| Admin app | **Separate Next.js app (`apps/admin`), separate subdomain** | Two-tier RBAC with 7 external + 8 internal roles (Section 9.4) and a hard security requirement to isolate admin actions (billing, refunds, danger zone) — a physically separate deployment with its own auth plane and release cadence is a stronger isolation boundary than a single app gated by role checks. |
| Component/design system | **Tailwind CSS + Radix UI primitives**, internal `packages/ui` | Section 7's institutional/GIS-terminal aesthetic (dark nav rail + light workspace, fixed color semantics) and Section E's 30-component reusable library are both easiest to enforce consistently as design tokens + shared headless-accessible components, not per-screen CSS. |
| Client state | **TanStack Query** (server state) + **Zustand** (client state) | TanStack Query fits the read-heavy property/search data; Zustand's small persisted store is a natural fit for the explicitly required "persistent comparison tray... available across the app." |
| Map/GIS | **Mapbox GL JS** (+ Mapbox Draw) | Requirement needs many simultaneous overlay layers (satellite, parcel, comps, soil, water, flood, wetlands, zoning, population growth, infrastructure) plus freehand area drawing and marker clustering at scale — Mapbox's vector-tile layering model fits this better than Leaflet (needs many plugins to match) or Google Maps (weaker custom-layer/GIS support at this density). |
| Backend/API | **Node.js + TypeScript, NestJS** | Modular monolith architecture (see Architectural Summary) maps directly onto Nest's module/DI system; shares TypeScript types with the Next.js frontends via a monorepo, reducing contract drift across a system with this many entities (properties, scores, reports, entitlements, AI responses). |
| Primary database | **PostgreSQL 16 + PostGIS** | Section F explicitly requires "relational storage for business objects, plus geospatial data... in one coherent architecture." PostGIS is the standard for parcel boundary/point-in-polygon and spatial-intersection queries (soils/flood/wetlands joins) and its JSONB support covers score breakdowns, AI response structures, and entitlement payloads without a separate document store. |
| Search index | **OpenSearch** | Section F explicitly calls out "search indexes" as distinct from the relational store; needed for fast faceted filter/sort/global-search (Section E) at a scale/latency Postgres alone won't sustain alongside heavy geospatial and transactional load. Synced from Postgres via outbox/CDC, not dual-written. |
| Cache/queue | **Redis + BullMQ** | The async-job requirement spans ingestion, scoring, report generation, PDF rendering, and alert evaluation — BullMQ on Redis gives reliable retry/backoff with one piece of infrastructure, appropriate for a modular monolith at MVP scale (documented as revisit-if-scale-demands, not a permanent choice). |
| Object storage | **S3 (or S3-compatible)** | Report PDFs, raw ingestion payload archives, cached imagery — delivered via short-TTL signed URLs to enforce the locked-content/entitlement boundary at the storage layer, not just the UI. |
| Vector/retrieval store | **pgvector extension on the primary Postgres instance** | AI report Q&A/grounding needs retrieval over property/report content to keep sourcing traceable ("cite/link back to platform data" — Section 7.6). pgvector avoids standing up a separate vector database for MVP query volume; flagged in Open Questions if volume assumptions change. |
| Hosting/deploy | **AWS** (ECS Fargate for API/workers, RDS for Postgres/PostGIS, OpenSearch Service, ElastiCache, S3, CloudFront) for both apps and data plane | A single-cloud setup gives one VPC/IAM boundary across the admin plane, geospatial data plane, and AI service — appropriate given the admin/investor isolation requirement above. (Vercel-for-frontend is a valid alternative purely for Next.js deploy velocity; flagged as an open question below since it's a real ops/cost tradeoff, not a technical requirement.) |
| Payments | **Stripe** (Billing for subscriptions, Checkout/PaymentIntents for one-time report purchases) | Needs both recurring subscription billing (5 plan tiers) and one-time purchases (4 report tiers) with proration-style upgrade-credit logic — Stripe supports both natively with webhooks for entitlement provisioning, keeping AgTerra out of PCI scope beyond SAQ-A. |
| Email | **Postmark** | Transactional-only sending (report delivery, alerts, receipts) benefits from a deliverability-focused provider kept separate from any future marketing ESP. |
| PDF generation | **Playwright (headless Chromium) rendering worker** | Reports have complex structured layout (score breakdown, comparables, charts) best authored as HTML/CSS reusing the same design-system components as the web report view, rendered to PDF as a background job — fits directly into the fulfillment state machine rather than a separate PDF-templating system. |
| AI/LLM | **Claude (Anthropic API)**, via an internal "AI Response Service" enforcing schema-constrained structured output | This is the only reliable way to guarantee the mandatory Conclusion→Evidence→Risks→Confidence→Sources→Next-action pattern (Section 8.3, DoD #5) across 9+ distinct AI use cases — enforced once at the orchestration layer via structured/tool-use output, not left to per-prompt discipline repeated in every call site. |
| Analytics | **Segment** (collection) → product analytics (Amplitude/PostHog) + warehouse feed for Revenue Analytics | Section G requires three distinct analytics categories (behavior, monetization, quality) feeding both product tooling and the admin Revenue Analytics module — single instrumentation point avoids triplicating event tracking code as destination-specific needs diverge. |
| Monorepo | **Turborepo + pnpm workspaces** | Shared TypeScript types (property/report/AI-response shapes) and the shared UI package are both required to keep the frontend/backend contract and the 30-component reusable library actually shared, not copy-pasted, across `apps/web`, `apps/admin`, and `apps/api`. |

## Open Architecture Questions

Genuinely architectural unknowns requiring Product Owner or Development Director input before implementation starts (distinct from the PRD's own already-deferred product questions like county selection, vendor names, or pricing figures):

1. **Single-cloud AWS vs. hybrid Vercel(frontend)+AWS(backend/data).** I've recommended single-cloud AWS for VPC/IAM simplicity given the admin-plane isolation requirement, but Vercel's Next.js-specific deploy velocity is a real, legitimate alternative. This is an ops-maturity/cost tradeoff, not a technical correctness question — needs Development Director sign-off.
2. **Separate admin app vs. single app with role-gated routes.** I've recommended a fully separate `apps/admin` deployment for security segregation, which has a real cost (duplicated shell/nav scaffolding, two release pipelines). Needs sign-off given team size and velocity priorities.
3. **AI feature availability by subscription tier.** The PRD's Free-tier entitlements say "no advanced AI," implying some AI Analyst functionality *is* tier-gated, but no explicit AI-feature-by-tier matrix exists (this is distinct from PRD Open Question 12 on what "Limited AI Analyst Drawer" means functionally — this question is about which tiers get AI access at all, which is a cost-control/architecture question for rate-limiting and quota design). Needed before `ai-engineer` can build gating and before cost budgets can be set per tier.
4. **County ingestion standardization vs. bespoke per-county scripts.** Florida counties vary widely in data format/API maturity. A common adapter contract now costs more upfront but avoids technical debt; bespoke per-county scripts are faster for the first few counties but compound as coverage expands. This decision should be made once the specific MVP counties are selected (PRD Open Question 3) but is itself an architecture tradeoff I need direction on, not just a data question.
5. **Premium report review staffing model.** Is Premium review performed by internal AgTerra analysts (matches my current `report_review_queue.assigned_admin_id` design, entirely internal) or an external contracted review service? The latter would require exposing a review API/portal to a vendor — a materially different integration and auth model. The PRD only establishes "human-in-the-loop," not who performs it.
6. **Regulatory/compliance scope for data retention.** Administration Settings explicitly requires "retention" and "compliance" configuration sections. Is there a specific regulatory target (state-level real-estate data rules, CCPA-equivalent handling of user PII) constraining audit-log retention/partitioning design, or is this generic best-practice placeholder for MVP? Affects whether `audit_log` needs time-based partitioning and a defined retention window now.
7. **DR/multi-region requirements for MVP.** Is single-region acceptable for Florida MVP, or does credibility with institutional-minded buyers (even though institutional access itself is Phase 2) require multi-AZ/DR posture from day one? Affects RDS/OpenSearch topology and cost.
8. **pgvector vs. dedicated vector database.** I've recommended pgvector on the primary Postgres instance to avoid extra infrastructure at MVP scale, but AI query volume pre-launch is genuinely unknown. Flagging for confirmation once usage projections exist rather than treating this as settled.
9. **Degree of "build it now" for the org seam.** Product Decision #1 says the schema must support adding an org layer "without a rewrite." I've interpreted that as: ship the real (empty) `organizations` table and `users.org_id` column now, not just document a future migration plan. Want explicit confirmation this is the intended scope — it's a small amount of extra schema work now in exchange for a guaranteed non-rewrite later, but it is extra work, and I want it agreed to rather than assumed.
