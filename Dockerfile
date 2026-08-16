# Olink Desk — one self-contained image (ADR 0004).
# The same image runs on Cloud Run (staging/demo), Ethio Telecom ECS
# (residency), and on-prem — nothing inside may assume a cloud.
# node:20-slim (glibc) rather than alpine: Prisma's query engine ships
# debian binaries by default and musl adds nothing here but risk.

# Every workspace manifest, collected automatically. This stage exists
# because the manifests used to be COPYied one line per package: adding
# `packages/sla` without touching this file produced an image that could
# not resolve the workspace, and three deploys failed on it while CI —
# which installs from the real repo root — stayed green. A new package
# must never be able to break the image by omission again.
FROM node:20-slim AS manifests
WORKDIR /src
COPY . .
RUN mkdir -p /out && \
    find . -name package.json -not -path "*/node_modules/*" \
      -exec install -D {} /out/{} \; && \
    install -D pnpm-lock.yaml /out/pnpm-lock.yaml && \
    install -D pnpm-workspace.yaml /out/pnpm-workspace.yaml && \
    install -D turbo.json /out/turbo.json

FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable
# Prisma engines need openssl present at generate AND run time.
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# Manifests only, so the install layer still caches on dependency changes
# rather than on every source edit.
COPY --from=manifests /out ./
RUN pnpm install --frozen-lockfile

COPY . .
# A dummy URL satisfies prisma generate (it never connects); the real one
# arrives at runtime via the environment.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm --filter @olink-desk/database prisma:generate
RUN pnpm --filter @olink-desk/web build
# Prisma's query engine lives deep in pnpm's store and Next's standalone
# tracer misses it (found in production: every DB route threw
# "could not locate the Query Engine for runtime debian-openssl-3.0.x").
# Drop it next to the schema — a location the client always searches.
RUN cp node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/libquery_engine-* packages/database/prisma/

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
  && groupadd -r desk && useradd -r -g desk desk

# Next standalone output carries the server and exactly the node_modules it
# needs — including the generated Prisma client.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
# Prisma CLI + schema for `migrate deploy` at container start or as a job.
COPY --from=build /app/packages/database/prisma ./packages/database/prisma

USER desk
EXPOSE 8080
ENV PORT=8080 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
