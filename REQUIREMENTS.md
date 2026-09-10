# AgTerra Intelligence — Requirements Spec

> Source: `AgTerra_Intelligence_PRD_v1_Complete.pdf` (Product Owner-supplied PRD, 43 logical pages, 10 sections + Appendix A / 21 mockups).
> Produced by the `pm` function of the AI Software Development Team operating model. This is the controlled requirements baseline — downstream roles (`ux`, `arch`, `fe`, `be`, `data`, `ai-engineer`) should treat it as approved input, not re-derive it from the PRD themselves.

## Key Product Decisions (Confirmed by Product Owner, 2026-09-08)

These resolve open questions 8, 9, 14, and the team-collaboration ambiguity (open question 11) below. Treat as controlled — do not silently reinterpret; if a conflict emerges, escalate back through the Development Director.

1. **Accounts are single-user for MVP.** No team/org functionality ships in MVP. The data model must still support adding an "organization" layer later (e.g. a user's account can be re-parented under an org) without a schema rewrite — design the auth/account schema with that seam in mind now, even though nothing exercises it yet.
2. **Institutional API is Phase 2, not MVP.** No external API auth/rate-limiting/versioning work in MVP.
3. **Premium report tier is human-in-the-loop.** Essential/Investor/Professional report tiers are fully automated generation. Premium Intelligence reports route through a queue for analyst review before delivery — report fulfillment architecture must support an "awaiting review" pipeline state, not just generate→deliver.
4. **Report purchases are not gated by subscription tier** — any authenticated user (including Free tier) can buy any report tier. **However, non-subscriber report pricing must run higher than subscriber report pricing**, by enough that upgrading to a paid monthly plan is the obviously better deal for a repeat buyer. This is a required business rule for `data`/`be` (pricing/entitlement tables) and `ux` (must be visible in Report Selection & Purchase — the recommendation logic should surface "upgrade to save" when a non-subscriber's report cost would exceed or approach a subscription's value). Exact price deltas are still open (see Open Question 2) — the *rule* (subscriber discount must exist and be meaningful) is confirmed; the *numbers* are not.

5. **AI Analyst access is gated by subscription tier.** Free and Basic subscribers get no AI Analyst access; Investor tier and above get full access (unlimited, full context). This reinforces the subscription incentive alongside the Decision 4 pricing differential.
6. **Premium report human review is performed by internal analysts** (AgTerra employees/staff), not external contractors. Architecture proceeds on this basis — review-queue auth uses the same internal `admin_users` model, no external vendor portal is needed.
7. **"Limited AI Analyst Drawer" (PRD Open Question 12) is resolved as: single-property context only for MVP** — not report/comparison/portfolio context (those need subsystems that don't exist yet). No persistent chat history shown across visits (each page load starts fresh in the UI, though every interaction is still logged server-side to `ai_interactions` for observability/audit regardless). A small fixed set of suggested starter questions, not a fully open-ended assistant. No "direct action" buttons (open comparables, attach property, etc.) since the features they'd trigger don't exist yet.
   - **Known temporary gap against Decision 5:** the first AI-layer build pass ships this feature fully public (no auth required at all), matching every other investor-facing endpoint built so far (Discover, Property Intelligence, Comparison) — building real login UI is separate, undelivered scope, not something to bolt on as a side effect of the AI feature. Decision 5's *rule* stands (Free/Basic get no access, Investor+ do), but real enforcement needs both a working subscription/entitlement system and login UI, neither of which exists yet. Cost control for this pass is a strict per-IP rate limit on the AI endpoint (since there's no authenticated user to rate-limit by) — this is a real, if blunt, guardrail against runaway API cost, not a substitute for real auth. This is a tracked gap, not an abandoned decision — add both login UI and the `ExternalRolesGuard` check once subscriptions exist, don't ship this gap silently past that point.
   - **Grounding approach for v1:** structured context injection (the property's actual score/valuation/risk-flag data, already fully available via the existing detail endpoint), not `pgvector` retrieval — there's no large unstructured corpus yet (no report content, no comparables, no ingested source documents) to justify real RAG. Revisit once one exists.
8. **Watchlist and Saved Searches are real login-gated account data — unlike the Comparison tray, which is deliberately anonymous/ephemeral (localStorage only).** Watching a property or saving a search only means something tied to a durable identity a person returns to across sessions/devices; building either as anonymous local state would be building a different, lesser feature than what the PRD actually describes (both are framed as per-account/per-tier entitlements in the persona table). This is the pass where real login/register UI finally gets built — not deferred further, and not bolted onto an unrelated feature (unlike the AI Analyst, which correctly stayed public specifically to avoid forcing this scope prematurely).
   - **Known temporary gaps, same pattern as Decision 5/7:** tier-based limits (e.g. Free tier's "limited watchlist") are not enforced — any authenticated user gets full access, regardless of plan, since subscriptions/entitlements don't exist yet. **No silent token refresh in v1** — the frontend uses the access token as-is and requires re-login after it expires (15 min for investors) rather than wiring the refresh-rotation flow client-side; the backend already supports rotation, this is purely a frontend v1 simplification. **No alerts of any kind** (score changes, price drops, new comparables, new saved-search matches) — alerting needs a change-detection mechanism against data that doesn't change over time yet (seed data is static) plus a notification-delivery subsystem (email via Postmark, per `ARCHITECTURE.md`), neither built. Saved Searches' "recommended searches" and "performance analytics" are deferred for the same reason — no usage history exists yet to recommend from or analyze.

9. **Exact pricing (PRD Open Question 2) is resolved — no longer indicative, these are the real launch prices:**
   - Subscription plans: Free $0/mo, Basic $29/mo, Investor $79/mo, Professional $199/mo. (Institutional remains custom-quoted, not a self-serve plan — out of scope for this pass, see below.)
   - Per-property report tiers, **subscriber price**: Essential $49, Investor $99, Professional $249, Premium Intelligence $499.
   - **Decision 4's non-subscriber differential is resolved as +50%**: Essential $73.50, Investor $148.50, Professional $373.50, Premium $748.50 for a non-subscriber. The PRD's stated figures are the subscriber reward price, not the default — a non-subscriber sees the higher number first, reinforcing the subscription incentive.
   - Upgrade credit (already-established rule) is computed against whichever of these two prices the user actually paid, not against list price.
10. **What a purchased report actually contains, v1** — this needed a concrete answer since it isn't fully buildable as the PRD originally envisioned (comparables, ownership records, and regulatory data don't exist as real data sources yet, so genuinely tiered *content depth* can't be built from data we don't have). Resolved as: a report is a **persisted, tier-scoped-depth AI investment analysis** for that property, built on the same AI Response Service the free AI Analyst uses — Essential persists a thesis-depth analysis, Investor and Professional request progressively more thorough analysis (more evidence, more explicit scenario/risk framing) from the same service. The real differentiation from the *free* AI Analyst (which stays public and unchanged) is **persistence** (a report is saved permanently, not regenerated fresh and thrown away each visit) and **depth**, not access to data that doesn't exist. Real PDF rendering (Playwright, per `ARCHITECTURE.md`) remains deferred — a report is a page in the app, not a downloadable file, for this pass.
    - **Premium Intelligence purchase is deferred entirely for this pass** — Decision 3's human-in-the-loop review queue is a real, separate admin-facing subsystem (queue UI, analyst assignment, approve/reject) that doesn't exist yet. Premium stays visible in pricing displays as a real tier (for pricing-page completeness) but isn't purchasable until that subsystem exists. Essential/Investor/Professional are the three tiers actually implemented and purchasable this pass, matching Decision 3's "fully automated" tiers exactly.
    - **Institutional plan is out of scope** — custom/sales-quoted, not a self-serve Stripe price object.
    - **No Stripe account exists yet** — same pattern as Mapbox/Anthropic: build the full integration now against test-mode keys once provided, nothing about the architecture is blocked on this.
    - **Two implementation gaps flagged by `be`, tracked here rather than silently left:** (1) a failed report generation after successful payment sets the order to `failed` and logs it — no automatic Stripe refund is attempted, since issuing one is a real financial action that belongs behind an actual review step (a future admin/support feature), not a backend error-handling side effect. (2) `customer.subscription.deleted`/cancellation syncs `Subscription.status` but does not revert `users.external_role` back toward `free` — a canceled subscriber keeps subscriber-tier access until this is wired in a follow-up pass. Neither blocks this pass's core purchase flow; both need real product input before building further (what should happen to an already-delivered report on a failed-then-refunded order? does role revert immediately on cancellation or at period end?) rather than an engineering guess.

These decisions supersede the corresponding rows under "Open Questions for Product Owner" below — that section is kept as-is for traceability back to the source PRD, but numbers 2, 8, 9, 11, 12, and 14 are resolved as of this decision log.

## Product Name

**AgTerra Intelligence** (AI-powered agricultural land investment intelligence platform).
Note: the PRD itself lists final product/company naming as unresolved — Open Question #1 (Section 10.5) is "Confirm final product/company name: AgTerra Intelligence or alternate investor-oriented brand." Use `agterra-intelligence` as the working project-folder slug pending confirmation.

## Objective

Build an AI-powered agricultural land investment intelligence platform (not a real-estate listing site) that helps users discover, evaluate, compare, monitor, and manage agricultural land opportunities across the United States, beginning with Florida. The product should function as an "investment intelligence terminal" — Bloomberg-style analytics combined with GIS mapping, agricultural data, and AI due diligence — that:
- Aggregates agricultural land listings and public/private data sources.
- Classifies and ranks properties by investment attractiveness via a transparent, explainable **Opportunity Score**.
- Explains why a property may be undervalued and surfaces risks that could invalidate the investment case.
- Monetizes deeper per-property intelligence through stratified, paid report tiers.
- Supports ongoing monitoring via watchlists, alerts, saved searches, and portfolio intelligence.
- Provides a full admin back office for data quality, fulfillment, billing, support, AI monitoring, and revenue analytics.

Business goals: differentiate in agricultural land intelligence starting in Florida and expanding nationally; generate revenue from recurring subscriptions, one-time reports, upgrades, and future institutional/API products; serve casual investors through institutions; drive recurring engagement via saved searches, watchlists, alerts, and portfolio monitoring.

**Explicit Non-Goals (MVP):**
- Not a transaction-closing, lending, escrow, title, or brokerage platform.
- Does not replace attorneys, appraisers, surveyors, title companies, environmental consultants, or agricultural engineers.
- Does not guarantee returns, legal conclusions, zoning outcomes, water rights, title condition, or environmental status.
- Institutional API access, team collaboration, and national coverage "may be staged after the Florida MVP unless prioritized separately" (PRD's own conditional language — see Open Questions).

## User

**External personas (Section 3):**
| Persona | Profile | Primary Usage |
|---|---|---|
| Opportunistic Land Investor | Individual/small group seeking undervalued land, distressed pricing, appreciation potential | Sorts by Opportunity Score/discount, compares, purchases Essential/Investor/Professional reports, monitors watchlist |
| Professional Land Investor | Serious investor/acquisition group | Advanced filters, valuation, comparables, AI thesis generation, comparison, monitoring |
| Agricultural Operator | Farmer, rancher, grower, timber operator | Prioritizes soil, water, irrigation, crop suitability, pasture/timber, access, operating economics |
| Broker / Advisor | Broker, consultant, acquisition representative | Searches by region/strategy, compares, generates/shares reports, supports client recommendations |
| Developer / Strategic Buyer | Alternative-use, entitlement, conservation, solar, future-development buyer | Evaluates zoning, utilities, access, roads, surrounding growth, strategic optionality |
| Institutional User | Fund, family office, REIT, land bank, large acquisition team | Screens large volumes; needs exports, API, team seats, custom data, auditability, portfolio analytics |

**Internal/admin personas (Section 9.4 roles):** Super Admin, Admin, Support Agent, Data QA Reviewer, Report Fulfillment Manager, Billing Manager, AI/Model Monitor, Read-only Analyst.

**External account roles/tiers (Section 9.4):** Free User, Basic Subscriber, Investor Subscriber, Professional Subscriber, Institutional User, Team Admin, Team Member (team roles conflict with stated Non-Goals — see Open Questions).

## User Story

Representative stories across the primary workflow (the PRD does not phrase these as user stories itself; derived directly from stated purposes/actions per screen):

- As an Opportunistic Land Investor, I want to filter and map Florida agricultural land by investment criteria so that I can quickly find undervalued properties.
- As any investor, I want to see a transparent Opportunity Score and its explanation on a property so that I understand why it's ranked as attractive (or not) before spending time or money.
- As an investor, I want to see risk signals alongside positive signals so that good-looking opportunities never hide dealbreakers.
- As an investor, I want to select and purchase a report tier (Essential/Investor/Professional/Premium) so that I can access progressively deeper due-diligence intelligence, and receive credit toward an upgrade if I've already purchased a lower tier.
- As an investor, I want to compare 2–6 properties side by side so that I can determine the strongest opportunity across price, discount, risk, agriculture profile, and required due diligence.
- As an investor, I want to save searches and configure watchlist alerts so that I'm notified of score changes, price reductions, new comparables, or risk updates without manually re-searching.
- As an investor, I want to ask an AI Investment Analyst property/report/portfolio-specific questions and receive answers with evidence, risk caveats, and confidence levels so that I never receive unsupported certainty.
- As a portfolio owner, I want to track owned properties' value, income, risk, and improvements in a Portfolio Workspace so I can manage post-acquisition performance (see Open Questions — this screen's MVP status is ambiguous).
- As a Super Admin/Billing Manager, I want to manage subscriptions, report purchases, entitlements, refunds, and promotions so that monetization operations run correctly.
- As a Data QA Reviewer, I want to review flagged/duplicate/incomplete property data so that platform data quality and confidence remain trustworthy.
- As an AI/Model Monitor, I want to track model uptime, prediction accuracy, hallucination/feedback signals, and guardrail metrics so that AI outputs stay safe and reliable.
- As a Support Agent, I want a ticketing workspace with user/order/property context so that I can resolve billing, data-dispute, and report-delivery issues.

## Workflow

**Primary investor workflow (Section 1.2, stated verbatim):**
**Discover → Rank → Investigate → Compare → Purchase Intelligence → Decide → Monitor → Manage**

Mapped to screens:
1. **Discover + Map Workspace** — apply filters, draw search area, view satellite/parcel/comp/soil/water/flood/zoning layers, select map markers.
2. **Rank** — properties surfaced/sorted via Opportunity Score.
3. **Investigate** — **Property Intelligence Page**: score breakdown, valuation, discount, risk, investment thesis, comparables, financial analysis.
4. **Compare** — **Comparison Workspace**: 2–6 properties side by side with AI recommendation.
5. **Purchase Intelligence** — **Report Selection & Purchase**: choose tier, apply upgrade credit, purchase.
6. **Decide** — **Purchased Report Workspace**: full report contents, AI Q&A on the report, due-diligence guidance.
7. **Monitor** — **Watchlist + Alerts**, **Saved Searches**: ongoing tracking of score/price/comp/risk changes.
8. **Manage** — **Portfolio Workspace**: post-acquisition tracking of owned properties, value trend, income, risk health, improvement tasks, exit scenarios.

Cross-cutting interaction rules (Section 7.6, treated as workflow contract):
- Property name is always clickable → opens Property Intelligence Page.
- Opportunity Score is always clickable → opens score explanation/breakdown.
- Watch toggles watchlist state and may open alert configuration.
- Compare adds property to a **persistent** comparison tray (available across the app).
- Report/entitlement status must be visible anywhere monetization is relevant.
- AI Analyst inherits current context (property, report, comparison, search, or portfolio).
- Navigating from Property Intelligence back to Discover must preserve filters, map position, sort order, and result state (no lost search state).

**Admin operational workflow (Section 6):** Admin Console Overview → drill into Billing/Entitlements, Report Fulfillment (order → generation → delivery/failure → resend/refund), Data Sources & Ingestion Monitor, Support Center (ticket → context → resolution), Content & Data Quality (flag → review → verify/correct), AI & Model Monitoring, Revenue Analytics, Administration Settings, Audit Logs.

## Functional Requirements

**A. Accounts & Access**
1. Account creation and login (MVP scope item, Section 10.1).
2. Role/entitlement-based access control across Free, Basic, Investor, Professional, Institutional, Team Admin, Team Member (external) and 8 internal admin roles (Section 9.4).

**B. Investor-Facing Screens (Section 5)** — each with stated purpose, modules, actions, and a screen-level acceptance criterion:
1. **Investor Dashboard** — command center: active/exceptional/new-match/reduced-price/highest-ranked opportunities, opportunity intelligence feed, watchlist snapshot, saved-search matches. Actions: open property, new search, review alert, open watchlist/report/saved-search matches.
2. **Discover + Map Workspace** — advanced filters, active filter chips, map layers (satellite, parcel boundaries, comps, soil, water, flood, wetlands, zoning, population growth, infrastructure), score markers, ranked results. Actions: apply filters, draw search area, select marker, preview, analyze, compare, watch, save search.
3. **Property Intelligence Page** — Opportunity Score, asking price, price/acre, estimated value, discount, risk, satellite/parcel visualization, investment thesis, risks, key metrics, comparables, financial analysis, report prompts. Actions: analyze, watch, compare, share, view score breakdown, ask AI, unlock report.
4. **Report Selection & Purchase** — property summary, Opportunity Score, report tier cards/pricing, recommended report, comparison matrix, upgrade logic, purchase confidence. Actions: select/compare tier, purchase, view recommendation, apply upgrade credit.
5. **Purchased Report / Intelligence Workspace** — report status, executive conclusion, valuation, agriculture, water, environmental, zoning, market, comparables, ownership, due diligence, documents, sources, AI report Q&A. Actions: open sections, download PDF, ask AI, upgrade report, watch, compare.
6. **Comparison Workspace** — side-by-side for 2–6 properties: score, price, price/acre, estimated value, discount, acreage, soil, water, risk, zoning, appreciation, income, strategic optionality, report availability, charts, AI recommendation. Actions: add/remove property, save/export comparison, generate comparison report, watch selected.
7. **Watchlist + Alerts** — watched properties, score changes, price reductions, new comps, risk updates, listing status, recent alerts, activity charts, alert settings. Actions: view, configure alerts, mark read, open alert, add property, sort by activity.
8. **Saved Searches** — search list, criteria summaries, match counts, new matches, alert toggles, recommended searches, performance analytics. Actions: create, edit, pause, duplicate, delete, use recommended search, review matches.
9. **AI Investment Analyst Drawer** — context-aware (property/map/report/portfolio); suggested questions, structured answers, evidence, risks, confidence, source links, direct actions. Actions: ask question, open comparables, analyze income potential, view report, attach property, inspect sources.
10. **Portfolio Workspace** — owned properties, portfolio value, acres, unrealized gain, income estimate, value trend, land-use distribution, property table, risk health, tasks, improvements, exit scenarios, AI recommendations. Actions: add property, view asset, track project, review exit scenarios, open AI recommendation.

**C. Admin-Facing Screens (Section 6)**:
1. **Admin Console Overview** — users, reports sold, revenue, active listings, revenue overview, report sales by type, system health, recent users/purchases, tickets, ingestion, AI monitoring, platform shortcuts.
2. **Billing, Subscriptions & Report Entitlements** — plans, MRR, report sales, entitlements, usage limits, promotions, payments/refunds, revenue analytics, audit log.
3. **Report Fulfillment** — orders, completed/in-progress/failed reports, average fulfillment time, order detail, pipeline/file status, resend/download/refund.
4. **Data Sources & Ingestion Monitor** — active sources, new listings, ingestion success/sync time/volume, source distribution, logs, quality summary, coverage map, alerts.
5. **Support Center** — ticket table, detail panel, conversation, internal notes, related orders, user/property profile, support tools.
6. **Content & Data Quality** — flagged properties, verified/pending status, data issues, review table, parcel map, source info, AI analysis, history, issue charts.
7. **AI & Model Monitoring** — uptime, response time, prediction accuracy, reports generated, alerts, model status, input quality, user feedback, guardrails, safety metrics.
8. **Revenue Analytics** — revenue trend/mix, revenue by persona, report tier performance, subscription performance, cohort retention, high-value transactions, geography.
9. **Administration Settings** — organization info, platform configuration, feature settings, time/region, retention, maintenance mode, security, notifications, integrations, API/developer, compliance, branding, danger zone.

**D. AI Requirements (Section 9.2)**
- Supports: property summarization, investment thesis generation, score explanation, comparable interpretation, risk summary, report generation, user Q&A, portfolio recommendations, support assistance, anomaly detection.
- Every AI answer must follow the structured **AI Response Pattern** (Section 8.3): Conclusion → Evidence → Risks → Confidence (high/moderate/limited/unknown) → Sources → Next action.

**E. Reusable Components (Section 8)** — must implement as shared components: application shell, nav sidebar, global search, KPI card, Opportunity Score badge, risk badge, property card, property table, investment metric card, map marker, map preview card, filter panel, active filter chip, report tier card, locked intelligence panel, comparison tray, comparison table, watchlist table, alert card, saved search card, AI analyst drawer, report contents panel, data-source health indicator, support ticket panel, admin status badge, entitlement badge, audit-log row, source transparency drawer.

**F. Technical/Architecture Requirements (Section 9.3)**
- Frontend: desktop-first responsive web app; data-dense tables; map-heavy workflows; reusable components; drawers/modals; loading/error states.
- Backend: authentication, authorization, ingestion, geospatial queries, scoring, valuation, reports, payments, subscriptions, watchlists, saved searches, alerts, admin operations, audit logs.
- Database: relational business objects, geospatial data, search indexes, event logs, entitlement records, report storage metadata, audit history.
- Integrations required: listings, county records, USDA/NRCS soils, FEMA flood zones, wetlands, satellite imagery, maps/GIS, payments, email delivery, PDF generation, analytics tracking.

**G. Analytics Requirements (Section 9.5)**
- User behavior: searches, filters, map interactions, property views, watches, comparisons, reports viewed/purchased, upgrades, AI questions.
- Monetization: conversion by persona, subscription conversion, report conversion, upgrade rate, AOV, churn, retention, refund rate, revenue by tier/geography.
- Quality: data-source errors, report-generation failures, model alerts, support-ticket volume, AI feedback, property-data disputes.

## Business Rules

**Monetization (Section 4):**
- Subscription plans (indicative pricing): Free ($0), Basic ($29/mo), Investor ($79/mo), Professional ($199/mo), Institutional (custom) — each with defined entitlements (see PRD table; Free = limited search/watchlist, basic score visibility, limited report preview, no advanced AI/exports; Professional = advanced filtering, exports, AI Analyst, portfolio intelligence, "future teams").
- Per-property report tiers (indicative pricing): Essential ($49), Investor ($99), Professional ($249), Premium Intelligence ($499) — each additive on the previous tier's contents (Essential facts/score/basic valuation/comps/risk → ... → Premium adds max research depth, ownership intelligence, regulatory research, infrastructure/utilities, strategic analysis, custom scenarios, enhanced AI synthesis, **priority analyst review**).
- **Upgrade credit rule:** a user who purchased a lower-tier report receives credit toward a higher tier, computed as the price difference (worked example: Investor $99 → Professional $249 = $150 upgrade cost). This credit must be visible in both investor UX and the admin billing screen.
- All prices are explicitly labeled "Indicative" — not final (see Open Questions).

**Opportunity Score bands (Section 8.1):** 90–100 Exceptional (dominant green/gold, top rankings), 80–89 Strong (positive/shortlist), 70–79 Promising (positive but needs more verification/lower confidence), 60–69 Watch (monitoring candidate, not primary target unless strategy-specific), Below 60 Limited Opportunity (lower priority).

**Locked intelligence pattern (Section 8.2):** Locked/paid sections must remain visible (not hidden) but not expose full content; the panel must state what analysis is available, the required tier, price/upgrade path, and why it matters to the investment decision.

**Design/data-integrity rules (Section 7.2, 7.6):**
- Risk transparency: positive opportunity signals must never hide risk indicators.
- Data confidence must be distinguished across four states: verified data, modeled estimates, AI inferences, unknown data.
- Commercial clarity: paid reports must clearly explain the additional intelligence unlocked.
- AI must distinguish facts vs. model estimates vs. AI inferences; avoid guaranteed-return language and unsupported certainty; cite/link back to platform data; flag missing data and recommend professional verification for legal, water, title, environmental, and zoning matters.
- Permissions must restrict report access, admin screens, billing actions, refunds, data edits, AI/model settings, and audit logs by role and entitlement.

**Non-goal constraints (treated as hard business rules, Section 2.3):** no transaction-closing/lending/escrow/title/brokerage functionality; no professional-service replacement claims; no guarantees of returns, legal conclusions, zoning outcomes, water rights, title condition, or environmental status.

**Geographic rollout (Section 2.4):** Phase 1 = Florida only (listings, parcels, comps, soil, water, flood/wetlands, zoning/land use, satellite imagery, market signals). Phase 2 = additional agricultural states (GA, AL, TX, NC, SC, TN, AR, MS, OK, KS — listed as "potential," not committed). Phase 3 = national + institutional feeds + custom analytics + portfolio-scale intelligence.

## Edge Cases

- **Inconsistent/unavailable county data** — must be visually distinguished from a genuine negative finding (absence of data ≠ bad data); mitigated by starting with reliable FL counties and showing per-field confidence.
- **Valuation disputes/inaccuracy** — must show value ranges, comparables, confidence levels, and methodology, plus support a user feedback/dispute workflow.
- **Locked content viewed without entitlement** — must render a teaser/explainer, never raw restricted content and never a hard blank.
- **Report generation failure** — admin Report Fulfillment screen explicitly tracks "failed reports" and requires resend/download/refund tooling.
- **AI hallucination / low-confidence answers** — must be monitored (hallucination rate), gated by guardrails, and shown with an explicit confidence level (including "unknown").
- **Duplicate or incomplete property records** — Content & Data Quality screen requires duplicate detection and missing-field review before data is trusted/published.
- **Degraded or failed ingestion feed** — Data Sources & Ingestion Monitor requires alerts on ingestion success rate, sync time, and error rate.
- **Refund/billing disputes** — must be actionable from both Support Center (ticket → related order → refund) and Billing screen.
- **Comparison workspace boundary** — supports 2–6 properties; behavior below 2 or above 6 is not specified (see Open Questions).
- **Platform maintenance / danger-zone actions** — Administration Settings explicitly requires a "maintenance mode" and a "danger zone," implying destructive/high-risk admin actions must be gated separately from normal settings.
- **AI/report legal exposure** — every AI/report output touching legal, water, title, environmental, or zoning topics must recommend professional verification rather than asserting a conclusion.

## Acceptance Criteria

**Per-screen (Section 5, stated verbatim as design intent):**
- Investor Dashboard: a first-time user can identify the best opportunities and what changed since the last visit within seconds.
- Discover + Map Workspace: user can filter Florida agricultural land, identify high-scoring properties visually, and move to full analysis without losing search state.
- Property Intelligence Page: user understands why a property is attractive, what risks exist, what data is missing, and what paid report unlocks deeper intelligence.
- Report Selection & Purchase: user understands what each report tier includes and why the recommended report has value.
- Purchased Report Workspace: user feels the report provides meaningful evidence, structure, and due-diligence guidance.
- Comparison Workspace: user can determine the strongest property, best discount, lowest risk, best agriculture profile, and needed due diligence.
- Watchlist + Alerts: user knows which watched properties changed and why the change matters.
- Saved Searches: user can create and monitor investment strategies rather than manually repeating searches.
- AI Analyst Drawer: AI helps users move through structured evidence; it never replaces professional due diligence or unsupported certainty.
- Portfolio Workspace: user can understand portfolio performance, risk, income, improvements, and next strategic actions.

**MVP-level (Section 10.3):**
- User can search Florida agricultural land and filter by investment/agricultural criteria.
- User can identify high-ranking opportunities and understand why they are attractive.
- User can see key risks, missing information, and data confidence.
- User can compare properties, save properties, and monitor alerts.
- User can save acquisition strategies as searches.
- User can purchase and access a property-specific report.
- User can ask AI property-specific questions with evidence and confidence indicators.
- Admin can manage users, subscriptions, entitlements, report fulfillment, data health, support, QA, AI monitoring, revenue, settings, and audit history.

## Dependencies

- **Data source integrations (not yet selected — see Open Questions):** agricultural land listings feed(s), county property/tax records, USDA/NRCS soils data, FEMA flood zone data, wetlands data, satellite/aerial imagery provider, maps/GIS provider.
- **Commerce/infrastructure integrations:** payment processor (unselected), email delivery provider (unselected), PDF/report-generation stack (unselected), analytics tracking platform.
- **Content dependency:** the 21 approved UX mockups (Appendix A, Figures 1–21) are the required visual/interaction reference for engineering implementation — copy, spacing, accessibility, and component consistency are still to be refined, but information hierarchy and interaction intent must be reproduced.
- **Legal dependency:** required disclaimers and a legal review process are not yet defined (Open Question), which gates any AI-generated investment content and report language.
- **Geographic data dependency:** MVP is hard-scoped to Florida; specific Florida counties for MVP are not yet selected (Open Question), which gates ingestion and coverage-map scope.

## Definition of Done

A feature/release is done when:
1. All MVP Investor Features (Section 10.1: account/login, dashboard, FL discovery, map, result cards, Opportunity Score, Property Intelligence Page, Report Selection & Purchase, Purchased Report Page, Watchlist, Alerts, Saved Searches, Comparison Workspace, Limited AI Analyst Drawer, subscription plans, report entitlements) are implemented and pass their stated screen-level acceptance criteria.
2. All MVP Admin Features (Section 10.2: dashboard overview, user management, billing/subscription management, report purchase management, report fulfillment tracking, data-source monitor, Support Center, Content/Data QA, AI/model monitoring, revenue analytics, administration settings, audit logs) are implemented.
3. All MVP acceptance criteria (Section 10.3) are verifiably met.
4. Role/entitlement-based permissions are enforced across every report, admin screen, billing action, refund, data edit, AI/model setting, and audit log per Section 9.4.
5. Every AI-generated response follows the Conclusion/Evidence/Risks/Confidence/Sources/Next-action pattern (Section 8.3) and complies with the guardrails in Section 9.2 (no guaranteed-return language, cites platform data, flags missing data, recommends professional verification for legal/water/title/environmental/zoning topics).
6. Locked/paid content follows the locked-intelligence pattern (Section 8.2) rather than being hidden or fully exposed.
7. Data confidence (verified / modeled / AI-inferred / unknown) is visibly distinguished wherever data is shown.
8. UI matches the approved visual system and design principles (Section 7): institutional/GIS-terminal aesthetic, specified typography scale, dark nav rail + light workspace, color semantics (green=opportunity/agriculture, gold=premium, amber/red=risk, blue=info/action), and the required navigation structure (investor and admin nav item lists in Section 7.5).
9. Required analytics events (Section 9.5: user behavior, monetization, quality) are instrumented.
10. Non-goal constraints (Section 2.3) are not violated anywhere in the shipped product (no transaction/escrow/brokerage functions, no outcome guarantees).

## Open Questions for Product Owner

Explicitly stated in the PRD (Section 10.5, "Open Questions Before Build") — carried forward verbatim:
1. Confirm final product/company name: AgTerra Intelligence or an alternate investor-oriented brand.
2. Confirm exact subscription pricing and report pricing (all current figures are labeled "Indicative").
3. Select initial Florida counties for MVP.
4. Validate priority data providers and API feasibility.
5. Select payment processor, map/GIS provider, email provider, and PDF/report-generation stack.
6. Define required disclaimers and legal review process.
7. Determine whether broker/licensed real-estate activities will be included.
8. Decide whether institutional API access is MVP or Phase 2.
9. Define whether Premium reports are fully automated or include manual analyst review (note: the Premium tier description already promises "priority analyst review," which presupposes a human-in-the-loop component this open question says is still undecided — internal contradiction to resolve).

Additional ambiguities/contradictions identified during translation (not explicitly flagged by the PRD itself):
10. **Portfolio Workspace MVP status is unclear.** It is fully specified as an investor-facing screen (Section 5) with an approved mockup (Figure 11), but it is absent from the explicit "MVP Investor Features" list (Section 10.1). Confirm whether it ships in the Florida MVP or is deferred.
11. **Team collaboration status conflicts.** Section 2.3 (Non-Goals) says team collaboration "may be staged after the Florida MVP unless prioritized separately," but Section 9.4 defines "Team Admin" and "Team Member" as external roles with no phase qualifier, and the Professional plan's entitlements list "future teams." Confirm whether any team functionality is in MVP scope or purely a Phase 2+ placeholder.
12. **"Limited AI Analyst Drawer" is undefined.** Section 10.1 scopes MVP AI Analyst as "Limited," but Section 5's full feature description (suggested questions, evidence, risks, confidence, source links, direct actions) carries no qualifier distinguishing full vs. limited behavior. Define what is cut for MVP.
13. **Comparison Workspace boundary behavior (2–6 properties)** is stated as a range but no behavior is defined for attempting to compare fewer than 2 or more than 6 properties (disable button, error, silent cap, etc.).
14. **Report purchase eligibility** — the PRD implies per-property reports can be purchased independent of subscription tier (e.g., Free/Basic users buying Essential–Premium reports per the Opportunistic Investor persona), but this is never stated as an explicit rule; confirm whether any report tier requires a minimum subscription plan.
15. **Phase 2 state list is non-committal** ("Potential states include..." — Section 2.4); confirm whether this list is a firm roadmap or illustrative only.

## Stated/Implied Tech Stack

The PRD does **not** specify concrete frameworks, languages, cloud provider, or specific vendor products — technology choices are explicitly left to engineering, and PRD Open Question #5 explicitly defers selection of "payment processor, map/GIS provider, email provider, and PDF/report generation stack."

What Section 9.3 ("Technical Architecture Requirements") specifies is **capability-level only**:
- **Frontend:** desktop-first responsive web app; data-dense tables; map-heavy workflows; reusable component library; drawers/modals; loading/error states.
- **Backend:** must support authentication, authorization, ingestion pipelines, geospatial queries, scoring/valuation logic, report generation, payments, subscriptions, watchlists, saved searches, alerts, admin operations, and audit logging.
- **Database:** relational storage for business objects, plus geospatial data, search indexes, event logs, entitlement records, report storage metadata, and audit history (implies a mixed relational + geospatial + search-index architecture, but no specific engine named).
- **Required integration categories** (vendors unnamed): agricultural listings sources, county records, USDA/NRCS soils data, FEMA flood zone data, wetlands data, satellite imagery, maps/GIS, payments, email delivery, PDF generation, analytics tracking.

**Conclusion: this PRD leaves the technology stack entirely to engineering** — it defines what the system must do, not what it must be built with.

## Scope Assessment

This is a **full platform build**, not a single feature and not a lightweight MVP. Even the PRD's own "MVP" (Section 10) spans:
- 10 major investor-facing workspaces (dashboard, discovery/map, property intelligence, report purchase, purchased-report workspace, comparison, watchlist/alerts, saved searches, AI analyst, portfolio),
- 9 major admin back-office modules (overview, billing/entitlements, fulfillment, data-source monitoring, support, content/data QA, AI/model monitoring, revenue analytics, settings/audit),
- a 5-tier subscription model plus a 4-tier per-property paid report system with upgrade-credit logic,
- an AI layer used across summarization, thesis generation, scoring explanation, risk summarization, report generation, Q&A, portfolio recommendations, and support/anomaly detection,
- a geospatial data-ingestion architecture pulling from at least 6 categories of external data sources,
- a two-tier (external + internal) role/permission system with 7 external and 8 internal roles,
- and a full analytics/audit layer.

The only real scope constraint on the "MVP" is **geographic** — Florida only, with expansion to additional states and then national coverage explicitly staged as Phase 2/Phase 3. In other words: this is a **full-featured v1 platform (investor product + admin operations suite) scoped to one state**, not a narrow proof-of-concept. Engineering/estimation should treat it accordingly — this is multi-quarter, multi-team scope, not a sprint-sized feature.
