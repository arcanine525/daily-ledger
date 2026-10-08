FROM node:22.23.3-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS ops
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY scripts ./scripts
COPY src/server/auth/password.ts ./src/server/auth/password.ts
RUN pnpm exec prisma generate
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM dependencies AS builder
COPY . .
RUN pnpm exec prisma generate
RUN DATABASE_URL=postgresql://ledger:ledger@127.0.0.1:5432/ledger DIRECT_URL=postgresql://ledger:ledger@127.0.0.1:5432/ledger APP_ORIGIN=http://127.0.0.1:3000 PROVIDER_ENCRYPTION_KEY=AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE= PROVIDER_ENCRYPTION_KEY_ID=build-only pnpm build

FROM base AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/scripts/deploy/start.mjs ./scripts/deploy/start.mjs
COPY --from=builder --chown=node:node /app/src/server/env.ts ./src/server/env.ts
COPY --from=dependencies --chown=node:node /app/node_modules/.pnpm/zod@4.6.5/node_modules/zod ./node_modules/zod
USER node
EXPOSE 3000
CMD ["node", "--experimental-strip-types", "scripts/deploy/start.mjs"]
