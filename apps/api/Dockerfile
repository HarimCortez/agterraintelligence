# Explicit, full-control build for the API out of the pnpm/Turborepo
# monorepo — bypasses Railway's (or any platform's) auto-detection, which
# was repeatedly falling back to plain `npm install` and choking on the
# `workspace:*` protocol dependency on @agterra/db.
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /repo

# Copy just the manifests first for better layer caching, then the full
# source. Includes every workspace's package.json so pnpm's workspace
# resolution has everything it needs before `pnpm install`.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/investor-web/package.json apps/investor-web/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/config/package.json packages/config/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @agterra/api build

ENV NODE_ENV=production
EXPOSE 3001

CMD ["pnpm", "--filter", "@agterra/api", "start"]
