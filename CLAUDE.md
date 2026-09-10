# AgTerra Intelligence

## Product purpose

AI-powered agricultural land investment intelligence platform (not a listing site): helps investors discover, rank, investigate, compare, purchase intelligence on, and monitor agricultural land — starting with Florida — via a transparent Opportunity Score, risk signals, and structured AI due diligence, backed by a full admin operations back office.

## Controlled specs

`REQUIREMENTS.md`, `ARCHITECTURE.md`, and `DESIGN-SYSTEM.md` (typography only so far) at the repo root are the controlled, PM/architect/UX-approved specs for this project. Treat them as approved input, not something to re-derive or silently reinterpret — escalate conflicts through the Development Director rather than resolving them unilaterally.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (React, TypeScript), App Router |
| Admin app | Separate Next.js app (`apps/admin-web`), isolated deployment/auth plane |
| Component/design system | Tailwind CSS + Radix UI primitives, internal `packages/ui` |
| Client state | TanStack Query (server state) + Zustand (client state) |
| Map/GIS | Mapbox GL JS (+ Mapbox Draw) |
| Backend/API | Node.js + TypeScript, NestJS (modular monolith) |
| Primary database | PostgreSQL 16 + PostGIS |
| Search index | OpenSearch (synced from Postgres via outbox/CDC) |
| Cache/queue | Redis + BullMQ |
| Object storage | S3 (or S3-compatible), short-TTL signed URLs |
| Vector/retrieval | pgvector extension on primary Postgres |
| Hosting/deploy | AWS (ECS Fargate, RDS, OpenSearch Service, ElastiCache, S3, CloudFront) |
| Payments | Stripe (Billing + Checkout/PaymentIntents) |
| Email | Postmark |
| PDF generation | Playwright (headless Chromium) rendering worker |
| AI/LLM | Claude (Anthropic API) via an internal AI Response Service, schema-constrained structured output |
| Analytics | Segment → Amplitude/PostHog + warehouse |
| Monorepo | Turborepo + pnpm workspaces |

Full justification for each choice is in `ARCHITECTURE.md`'s "Recommended Technology Stack."

## Repo layout

Turborepo + pnpm workspaces:

```
apps/
  api/             NestJS backend (modular monolith)
  investor-web/    Next.js (App Router) investor-facing app
  admin-web/       Next.js (App Router) admin console — separate deployment/auth plane
packages/
  ui/              Shared design-system package (consumed by investor-web and admin-web)
  config/          Shared TypeScript/ESLint/Prettier base configuration
  db/              Prisma schema, migrations, and generated client (consumed by apps/api)
```

Root scripts (`pnpm install`, `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`) fan out to every workspace via Turborepo.

## Database

**ORM/migrations:** [Prisma](https://www.prisma.io/) (`prisma` CLI + `@prisma/client`), against **PostgreSQL 16 + PostGIS**. Chosen per `ARCHITECTURE.md`'s recommendation — it's the standard fit for NestJS + Postgres, gives forward-only versioned migrations out of the box (satisfies the Migration Plan's requirement), generates fully-typed query results shareable across the monorepo, and supports native Postgres enums and the `postgresqlExtensions` preview feature needed to enable PostGIS from the schema itself.

**Where it lives:** `packages/db` is the single source of truth for the data model — a workspace package, not code inside `apps/api`, so any future service (workers, scripts, another app) can depend on the same schema/client without depending on the API app.

- `packages/db/prisma/schema.prisma` — the schema (currently Identity & Access domain only: `organizations`, `users`, `admin_users`, `role_permissions`, plus `refresh_tokens`/`admin_refresh_tokens` — the last two added by `be` on top of `data`'s original four tables, to back the rotating-refresh-token requirement; see the "Authentication" section below. See `ARCHITECTURE.md`'s "Database Changes" for what's in scope per phase — do not add Property/Monetization/Engagement tables here until their phase).
- `packages/db/prisma/migrations/` — forward-only migration history, committed to the repo.
- `packages/db/prisma.config.ts` — Prisma's config entrypoint (loads `packages/db/.env` for local CLI use; Prisma 6's config-file mode replaces the older `package.json#prisma` key).
- `packages/db/src/index.ts` — re-exports `@prisma/client`. Deliberately has no NestJS wiring (no `PrismaService`/`PrismaModule`) — that's application wiring for `be` to add in `apps/api`'s Identity & Access module, e.g. a small service that calls `this.$connect()`/`this.$disconnect()` in Nest lifecycle hooks.
- `apps/api/package.json` already depends on `@agterra/db` (workspace dependency) so `be` can `import { PrismaClient } from "@agterra/db"` immediately.

**Schema notes for `be` (Identity & Access):**
- `users.org_id` is a nullable FK to `organizations.id`, `ON DELETE SET NULL` — deleting an org never deletes its users. This is the org-seam (Product Decision #1): every account-scoped query must still go through the `AccountContext` abstraction `be` builds, not a raw `WHERE user_id = ...`.
- `admin_users` is a fully separate table from `users` (not a role flag) — separate auth plane, per Product Decision #6 and the security isolation requirement.
- `external_role` (7 values) and `internal_role` (8 values) are real Postgres enums, generated as native Prisma enums.
- `role_permissions` is the table-driven internal RBAC policy store: `(role, permission_key)` is unique; check `allowed` there instead of branching on role in code.
- `users.email` and `admin_users.email` both have unique constraints (separately — the same email can exist in both tables, since they're different auth planes).
- The `postgis` extension is enabled in the first migration (via the schema's `datasource.extensions`) even though no geometry/geography columns exist yet — Phase 1's `properties`/reference-layer tables will use it.

**Property & Geospatial schema (added for Discover + Map Workspace v1)** — deliberately narrower than `ARCHITECTURE.md`'s full Property/geospatial design: `properties`, `opportunity_scores`, `property_valuations`, `property_risk_flags` only. No comparables, property data-sources, or reference layer tables yet — those are later phases.
- `properties.location` is `Unsupported("geography(Point,4326)")` in the Prisma schema — **not readable/writable via the generated Prisma Client.** Use `$queryRaw`/`$executeRaw` with `ST_X(location::geometry)`/`ST_Y(...)` to read, `ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography` to write. A GIST index (`properties_location_idx`) backs bbox/radius queries.
- `properties.address` is a display label (e.g. "Arcadia Citrus Grove Estate"), not a mailing address — rural parcels often don't have one.
- Money fields are `_cents` integers; `acreage` is `Decimal(10,2)`; `discount_pct` is `Decimal(6,2)` and can be negative (asking price above estimate).
- `opportunity_scores.band` is stored, not derived — a DB-level CHECK constraint guarantees it's always consistent with `score` (verified: an insert with a mismatched score/band pair is rejected). Safe to filter/sort on `band` directly.
- `Property.opportunityScore` / `Property.valuation` are one-to-one but nullable-by-absence — not every property is guaranteed to have a score/valuation row (e.g. before a scoring job runs). Plan optional joins accordingly.
- `property_risk_flags.risk_type` is a free string by design (no enum yet — the real risk taxonomy isn't defined). Don't hardcode a client-side enum against it.
- Seed data: `pnpm --filter @agterra/db seed` (idempotent, clears and reinserts) — 20 Florida properties across 5 counties, all 5 score bands represented, mixed land-use types and data-confidence levels, a subset with risk flags.

**⚠️ `prisma migrate dev` will show phantom drift on this schema** — the GIST index and the CHECK constraints (score/band consistency, positive acreage/price, score range) are hand-added SQL invisible to Prisma's model layer. This has now bitten three separate unrelated schema additions (each one triggered `migrate dev` to silently include a `DROP INDEX properties_location_idx` in its generated migration, caught after the fact and fixed with a follow-up restore migration each time — no data was ever lost, indexes don't hold data, but it's avoidable repeated overhead). **Prevent it up front instead of catching it after:**
1. Never run bare `prisma migrate dev` on this schema. Use `prisma migrate dev --create-only` instead — it generates the migration SQL file without applying it.
2. **Read the generated SQL file before applying it.** If it contains `DROP INDEX properties_location_idx` or drops any of the `properties` CHECK constraints, delete those specific statements from the file (the rest of the file — your actual new table/column changes — is fine to keep).
3. Then run `prisma migrate dev` again (it will apply the now-corrected pending migration) or `prisma migrate deploy`.
For routine, non-interactive applies where you already trust the migration history (CI, normal local use after your own schema change is done), `migrate deploy` remains the right command and doesn't have this problem at all — it only replays existing committed migrations, it never generates new ones by diffing against the schema.

**Local dev setup:**
1. **Preferred, works on any macOS version (10.15+):** [Postgres.app](https://postgresapp.com/) — a native Mac app bundling PostgreSQL + PostGIS, no VM/container layer. Install, click "Initialize" (creates + starts a server on port 5432 automatically), then add its CLI tools to your shell: `export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"`.
   - This is the actual method used for local dev on this project so far — `docker`, `OrbStack`, and `Colima` all now require **macOS 13+**, so the container route is a dead end on anything older (this machine runs macOS 12.7.6 Monterey). If you're on macOS 13+, `docker-compose.yml` (below) is equally valid — use whichever you have.
   - After initializing, **enable PostGIS on `template1` first** (as your Mac user, which Postgres.app makes a superuser by default): `psql -d template1 -c "CREATE EXTENSION IF NOT EXISTS postgis;"`. Every database created afterward — including Prisma's shadow databases — inherits it automatically from the template, with no elevated privileges needed on the app role. (Doing this on the `agterra` app database directly, as the earlier version of this doc said, doesn't cover Prisma's shadow-DB step — see the role-privilege note below.)
   - Create the app database and role: `createdb agterra`, then to match `docker-compose.yml`'s credentials exactly (so `DATABASE_URL` is identical either way): `psql -c "CREATE ROLE agterra WITH LOGIN PASSWORD 'agterra_dev_password' CREATEDB;" -c "ALTER DATABASE agterra OWNER TO agterra;"` then `psql -d agterra -c "GRANT ALL ON SCHEMA public TO agterra;"`.
   - **Role privileges — `CREATEDB` only, not superuser.** `prisma migrate dev` needs to create a throwaway shadow database to diff against, which needs `CREATEDB`. It does *not* need superuser, and superuser must not be granted to an app-level role even locally — an earlier pass here granted it as a shortcut and it was corrected back to `CREATEDB`-only once PostGIS was moved to `template1` (verified: `agterra` can create a fresh DB and use PostGIS in it with no elevated grant, confirmed by actually running the shadow-DB step, not just checking permissions in the abstract).
2. **Alternative, macOS 13+ only:** `docker-compose.yml` at the repo root starts Postgres 16 + PostGIS (`postgis/postgis:16-3.4` image) on port 5432, user/db `agterra`. Run `docker compose up -d`. (Note: local Postgres.app currently ships PostgreSQL 18 + PostGIS 3.6, not 16/3.4 — a documented version skew between the two local-dev paths; nothing in the schema depends on a 16-specific feature, so this hasn't mattered in practice. Production target per `ARCHITECTURE.md` is still Postgres 16 via RDS.)
3. Copy `packages/db/.env.example` to `packages/db/.env` (already gitignored) — the default `DATABASE_URL` works unchanged with either local-dev path above, as long as you created the matching `agterra` role/password.
4. From `packages/db/`: `pnpm install` (repo root), then:
   - `pnpm --filter @agterra/db migrate:dev` — create/apply a migration during schema development.
   - `pnpm --filter @agterra/db migrate:deploy` — apply existing migrations only (CI/production-safe, non-interactive).
   - `pnpm --filter @agterra/db generate` — regenerate the Prisma client after a schema change.
   - `pnpm --filter @agterra/db studio` — Prisma Studio GUI against the local DB.
5. `apps/api` needs its own `apps/api/.env` (see `apps/api/.env.example`) with `DATABASE_URL` plus four JWT secrets (see "Authentication" below) — generate real random values (`openssl rand -hex 32` per secret), don't ship the example file's placeholders.

**Verification performed:** `prisma validate`, `prisma migrate dev`, and `prisma migrate deploy` were run against a real, locally-running Postgres instance — first against a throwaway conda-forge/micromamba Postgres 16 during initial schema development (before local Postgres.app was set up), then for real against the project's actual persistent local dev database (Postgres.app, PostgreSQL 18 + PostGIS 3.6). Both migrations apply cleanly, create the `postgis` extension and all six tables/enums/indexes/FKs as expected. A full read/write smoke test passed end to end, including through the running API (not just direct DB queries) — see "Authentication" below for the full-stack verification (`register` → `login` → real JWTs, row confirmed in `users` via `psql`, password hash confirmed never returned in any API response).

## Authentication

Identity & Access (Phase 0) is implemented in `apps/api/src/identity-access/`, wired into `AppModule` via `IdentityAccessModule`. Built by `be` on top of `data`'s schema (see "Database" above).

**Two fully separate auth planes**, per `ARCHITECTURE.md`'s "deliberate blast-radius decision":

| | Investor plane | Admin plane |
|---|---|---|
| Table | `users` | `admin_users` |
| Routes | `/v1/auth/register`, `/v1/auth/login`, `/v1/auth/refresh`, `/v1/auth/logout` | `/v1/admin/auth/login`, `/v1/admin/auth/refresh`, `/v1/admin/auth/logout`, `/v1/admin/auth/mfa/setup`, `/v1/admin/auth/mfa/verify` |
| Module | `identity-access/investor/` | `identity-access/admin/` |
| JWT secret env vars | `JWT_INVESTOR_ACCESS_SECRET`, `JWT_INVESTOR_REFRESH_SECRET` | `JWT_ADMIN_ACCESS_SECRET`, `JWT_ADMIN_REFRESH_SECRET` |
| Refresh token table | `refresh_tokens` | `admin_refresh_tokens` |
| Default access/refresh TTL | 15m / 30d | 10m / 12h (shorter-lived, per ARCHITECTURE.md) |
| MFA | none | TOTP, required once enrolled (see below) |

The two planes never share a JWT signing secret, issuer, audience, guard, controller, or refresh-token table — a compromised investor session cannot present its token anywhere on the admin plane and vice versa, regardless of application-layer bugs elsewhere.

**Getting a token (investor):**
```
POST /v1/auth/register  { "email": "...", "password": "..." }   -> 201, public user (no tokens)
POST /v1/auth/login     { "email": "...", "password": "..." }   -> 200, { accessToken, refreshToken, user }
POST /v1/auth/refresh   { "refreshToken": "..." }                -> 200, a new { accessToken, refreshToken, user } (old refresh token is rotated/revoked)
POST /v1/auth/logout    { "refreshToken": "..." }                -> 204
```
Then call any protected investor route with `Authorization: Bearer <accessToken>`.

**Getting a token (admin — no self-registration; `admin_users` rows are provisioned out-of-band):**
```
POST /v1/admin/auth/login  { "email": "...", "password": "...", "totpCode"?: "123456" }
```
`totpCode` is required once the admin has enrolled MFA (`admin_users.mfa_secret` is set) — an enrolled account gets a 401 `{ error: "mfa_required" }` if it's missing or wrong. An admin with no `mfa_secret` yet can log in with just a password (see Scope/stubs below). Enroll via:
```
POST /v1/admin/auth/mfa/setup   (authenticated)  -> { secret, otpauthUri }   — NOT yet persisted
POST /v1/admin/auth/mfa/verify  (authenticated)  { "secret": "...", "totpCode": "123456" }  -> persists mfa_secret once the code checks out
```

**Refresh token rotation:** each refresh call verifies the presented token, mints a new access+refresh pair, marks the old `refresh_tokens`/`admin_refresh_tokens` row `revoked_at` and points its `replaced_by_id` at the new row, then returns the new pair. Presenting an already-revoked (reused) token revokes every other active token for that account, on the theory that reuse of a rotated token is a signal of theft. Only a SHA-256 hash of each refresh token is ever persisted.

**AccountContext (the org-seam abstraction):** `apps/api/src/common/account-context/account-context.ts`. Every account-scoped query in every domain module — this one and every one added in later phases — must resolve its tenant boundary through `AccountContext.scopeId` (`org_id` if the user has one, else the user's own id), never through a raw `user.id` comparison. `JwtAuthGuard` attaches the authenticated user to `req.user`; the `@CurrentAccountContext()` param decorator builds an `AccountContext` from that per request. `AccountContextService.forUserId()` builds one from a bare id for non-request contexts (background jobs). Since `org_id` is null for every MVP user today, `scopeId === userId` everywhere — the abstraction is what makes that fact invisible to callers, both now and once the org layer activates.

**RBAC:**
- **External** (`users.external_role`, 7 values): `@Roles(ExternalRole.investor_subscriber, ...)` + `ExternalRolesGuard`, applied after `JwtAuthGuard`. A route with no `@Roles(...)` is "any authenticated investor." Full entitlement resolution (`subscriptions`, `report_entitlements`) is a later phase — this is the role-check primitive those will build on.
- **Internal** (`admin_users.internal_role`, 8 values): table-driven against `role_permissions`, per ARCHITECTURE.md's requirement that permission enforcement not be hardcoded per role in code. `@RequirePermission('billing.refund')` + `PermissionsGuard`, applied after `AdminJwtAuthGuard`. `PermissionsService.isAllowed(role, permissionKey)` fails closed — a `(role, permissionKey)` pair with no row at all is denied, same as an explicit `allowed = false` row. Adding a new gated admin action anywhere is: pick a `permission_key` string, add the decorator, insert `role_permissions` rows — no guard code changes.

**Security baseline implemented:** bcrypt-family password hashing (`bcryptjs`, cost 12); every endpoint validated via `class-validator` DTOs under a global `whitelist`/`forbidNonWhitelisted`/`transform` `ValidationPipe`; rate limiting via `@nestjs/throttler` (app-wide default 100 req/min, tighter per-route `@Throttle` overrides on every auth endpoint — 5–20 requests per 5–10 min window depending on the route); responses only ever serialize an explicit allow-listed shape (`toPublicUser`/`toPublicAdminUser`), never a raw Prisma row, so `password_hash`/`mfa_secret` cannot leak through a response by omission; JWT secrets read from env vars only (`ConfigService.getOrThrow`), never hardcoded or defaulted.

**Fully implemented:** both auth planes end to end (register/login/refresh/logout), refresh-token rotation + reuse detection, `AccountContext`, both RBAC guards, MFA verification + enrollment handshake, rate limiting, input validation, response serialization.

**Stubbed / explicitly out of scope for this pass** (see code comments at each site for the full rationale):
- **MFA enrollment UX** — the backend enrollment handshake (`mfa/setup` → `mfa/verify`) is real and functional; QR-code rendering, recovery/backup codes, and forced-enrollment-before-first-login gating are not built. Today an admin with no `mfa_secret` yet can log in with just a password (`AdminAuthService.login`) — a product decision is needed on whether first login should hard-require enrollment before this ships to real admins.
- **Registration email verification** — out of scope per the work item; `InvestorAuthService.register` sets `status: "active"` directly rather than leaving new accounts at the schema's `pending_verification` default with no flow to unstick them. Revisit when the verification flow is built.
- **Password reset, OAuth/SSO** — not built; separate work items.

**Verified against a live database (2026-09-09):** once local Postgres.app was set up (see "Local dev setup" above), both migrations (including the previously-unrun `add_refresh_tokens` one) were applied for real via `prisma migrate deploy` — no errors. The running API (`pnpm --filter @agterra/api dev`, real env vars, no mocks) was then exercised end to end: `POST /v1/auth/register` → 201 with a real user row (confirmed via direct `psql` query against `users`, `password_hash` correctly absent from the API response); `POST /v1/auth/login` → 200 with real signed access + refresh JWTs. Test data was cleaned up afterward. Service-logic unit tests remain at `pnpm --filter @agterra/api test` (12 suites / 68 tests, mocked Prisma) — the live-DB pass above is the integration layer those don't cover.

**Env vars required to run `apps/api`** (see `apps/api/.env.example`):
```
DATABASE_URL                    # required (packages/db)
JWT_INVESTOR_ACCESS_SECRET      # required, no default
JWT_INVESTOR_REFRESH_SECRET     # required, no default — must differ from the admin secrets below
JWT_ADMIN_ACCESS_SECRET         # required, no default
JWT_ADMIN_REFRESH_SECRET        # required, no default — must differ from the investor secrets above
JWT_INVESTOR_ISSUER             # optional, default "agterra-investor-auth"
JWT_INVESTOR_AUDIENCE           # optional, default "agterra-investor"
JWT_INVESTOR_ACCESS_TTL         # optional, default "15m"
JWT_INVESTOR_REFRESH_TTL        # optional, default "30d"
JWT_ADMIN_ISSUER                # optional, default "agterra-admin-auth"
JWT_ADMIN_AUDIENCE              # optional, default "agterra-admin"
JWT_ADMIN_ACCESS_TTL            # optional, default "10m"
JWT_ADMIN_REFRESH_TTL           # optional, default "12h"
PORT                            # optional, default 3001
```
Nothing enforces at runtime that the investor and admin secrets differ — that's an operational invariant when provisioning them, not a code-level check.

## Property Search API

`GET /v1/properties` (`apps/api/src/properties/`) — public, no auth guard (matches Free-tier browsing). List/search over the seeded property data with AND-combined filters: `minPrice`/`maxPrice` (cents), `minAcreage`/`maxAcreage`, `minScore`/`maxScore`, `band`/`landUseType`/`listingStatus` (repeat the query key for multiple values, e.g. `?band=strong&band=exceptional` — not comma-separated), `county` (exact match), `bbox` (`minLng,minLat,maxLng,maxLat`), `sort` (`score_desc` default / `score_asc` / `price_asc` / `price_desc` / `discount_desc`), `limit`/`offset`. Defaults to `listingStatus=active` only unless explicitly overridden. Response: `{ results: [...], total, limit, offset }`, each result carrying `opportunityScore`/`valuation` as nullable-by-absence objects and `riskFlagCount` as a plain count (full risk-flag detail is a future property-detail endpoint, not this one). Verified against the live seeded database across band/price/bbox/multi-filter combinations, not just build-checked.

Implementation note: uses `$queryRawUnsafe` (not the tagged-template `$queryRaw`) to build the query, but every user-controlled value still goes through a numbered `$N` placeholder bound via the `params` array — the only string-interpolated parts are `WHERE`/`ORDER BY` fragments built from a fixed, hardcoded set of literal strings (a `switch` over an enum-validated `sort` value), never from raw user input. Functionally injection-safe despite the naming; worth using the tagged-template form for any new raw-SQL endpoint going forward for clarity, but this one was checked and is fine as-is.

## Notes for implementers

- `apps/api` now has Identity & Access wired up (both auth planes, `AccountContext`, RBAC — see "Authentication" above) alongside the root module + `GET /v1/health`. Further domain modules (Property & Geospatial, Scoring, AI, Monetization, Report Fulfillment, etc.) are added as separate NestJS modules imported into `AppModule` — see `ARCHITECTURE.md`'s "Components Affected" and "Build sequence."
- Org-seam requirement (`AccountContext`, `users.org_id`, `organizations` table) must be in the **first** schema migration — this is a Phase 0 architectural constraint, not deferred. It's done — see "Database" above.
- `apps/investor-web` and `apps/admin-web` are separate Next.js apps by design (admin/investor plane isolation) — do not merge them into one app with role-gated routes.
- All shared UI components live in `packages/ui`, not duplicated per-app.
