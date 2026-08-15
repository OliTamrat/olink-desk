# Olink Desk — one self-contained image (ADR 0004).
# The same image runs on Cloud Run (staging/demo), Ethio Telecom ECS
# (residency), and on-prem — nothing inside may assume a cloud.
# node:20-slim (glibc) rather than alpine: Prisma's query engine ships
# debian binaries by default and musl adds nothing here but risk.

FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable
# Prisma engines need openssl present at generate AND run time.
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/channels/package.json packages/channels/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/i18n/package.json packages/i18n/package.json
RUN pnpm install --frozen-lockfile

COPY . .
# A dummy URL satisfies prisma generate (it never connects); the real one
# arrives at runtime via the environment.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm --filter @olink-desk/database prisma:generate
RUN pnpm --filter @olink-desk/web build

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
