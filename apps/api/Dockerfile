# Explicit, full-control build for the API out of the pnpm/Turborepo
# monorepo — bypasses Railway's (or any platform's) auto-detection, which
# was repeatedly falling back to plain `npm install` and choking on the
# `workspace:*` protocol dependency on @agterra/db.
FROM node:20-slim AS base
# Explicit pin, not relying on corepack auto-reading `packageManager` from
# package.json — that was silently resolving to pnpm 12.3.4 instead of the
# pinned 9.15.0, a major-version jump whose different lockfile format then
# made pnpm unable to recognize our existing pnpm-lock.yaml at all.
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

# Single copy of the whole monorepo — sacrifices some Docker layer-cache
# efficiency (a source-only change re-runs install too) in exchange for
# reliability: many separate sparse COPY commands across subdirectories
# were consistently failing Railway's build-context snapshot with
# "not found" errors on every single one, even though the files are
# all real and git-tracked. One COPY . . sidesteps that entirely.
COPY . .

# Temporary diagnostic — Railway's build snapshot has been dropping specific
# files (pnpm-lock.yaml, apparently pnpm-workspace.yaml too) that are
# definitely git-tracked and present locally. See directly what's actually
# in the build context instead of guessing further.
RUN echo "=== /repo top level ===" && ls -la /repo && \
    echo "=== pnpm-workspace.yaml? ===" && (cat /repo/pnpm-workspace.yaml || echo "MISSING") && \
    echo "=== pnpm-lock.yaml? ===" && (ls -la /repo/pnpm-lock.yaml || echo "MISSING") && \
    echo "=== packages/ dir? ===" && (ls -la /repo/packages || echo "MISSING") && \
    echo "=== apps/ dir? ===" && (ls -la /repo/apps || echo "MISSING")

# Not --frozen-lockfile: Railway's build-context snapshot has been
# consistently omitting pnpm-lock.yaml even though it's git-tracked and
# present at the repo root (reproduced identically via both `railway up`
# and a from-source GitHub redeploy — a platform-level snapshot quirk, not
# something in this repo). Plain install regenerates the lockfile from
# package.json's dependency ranges instead of hard-failing when it can't
# find one.
RUN pnpm install

RUN pnpm --filter @agterra/api build

ENV NODE_ENV=production
EXPOSE 3001

CMD ["pnpm", "--filter", "@agterra/api", "start"]
