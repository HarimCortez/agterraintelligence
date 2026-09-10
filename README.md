# AgTerra Intelligence

AgTerra Intelligence is an AI-powered agricultural land investment intelligence platform (not a real-estate listing site) that helps users discover, evaluate, compare, monitor, and manage agricultural land opportunities across the United States, beginning with Florida. It functions as an "investment intelligence terminal" — combining GIS mapping, agricultural and geospatial data, a transparent Opportunity Score, and AI-assisted due diligence — with a full admin back office for data quality, fulfillment, billing, support, AI monitoring, and revenue analytics.

The controlled specs for this project are:

- [`REQUIREMENTS.md`](./REQUIREMENTS.md) — product requirements baseline (features, business rules, acceptance criteria).
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — architecture baseline (system design, data model, tech stack, build sequence).

Treat both as approved, controlled input — do not silently reinterpret them; escalate conflicts through the Development Director.

## Status

**Phase 0 — Foundations (scaffold only).** This repository currently contains the monorepo scaffold: empty, buildable app/package skeletons, shared tooling, and CI. No domain/business logic has been implemented yet. See `ARCHITECTURE.md`'s "Build sequence" for what comes next.

## Repo layout

Turborepo + pnpm workspaces monorepo:

```
apps/
  api/             NestJS backend (modular monolith) — empty skeleton, GET /v1/health only
  investor-web/    Next.js (App Router) investor-facing app — empty skeleton
  admin-web/       Next.js (App Router) admin console — separate deployment, empty skeleton
packages/
  ui/              Shared design-system package (consumed by investor-web and admin-web)
  config/          Shared TypeScript/ESLint/Prettier base configuration
```

## Requirements

- Node.js 20 LTS (pinned in `.node-version`)
- pnpm 9.x (pinned via `packageManager` in `package.json`; run via `corepack enable`)

## Getting started

```bash
pnpm install    # install all workspace dependencies
pnpm dev        # run all apps in dev mode (investor-web :3000, admin-web :3100, api :3001)
pnpm build      # build all apps/packages
pnpm lint       # lint all apps/packages
pnpm typecheck  # typecheck all apps/packages
pnpm test       # run tests in all apps/packages
```

All scripts are orchestrated by [Turborepo](https://turborepo.com) across the workspace defined in `pnpm-workspace.yaml`.
