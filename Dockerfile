# syntax=docker/dockerfile:1
# Multi-stage build. Build on the same architecture you deploy on
# (Apple Silicon / Oracle Ampere are both arm64, so the Prisma engine matches).

FROM node:22-alpine AS base
WORKDIR /app
# Prisma needs openssl + libc compat on Alpine.
RUN apk add --no-cache libc6-compat openssl

# ---- dependencies ----
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `npm run build` runs `prisma generate && next build`.
RUN npm run build

# ---- runtime ----
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Keep full node_modules so the Prisma CLI is available for `db push` at boot.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
