# ──────────────────────────────────────────────────────────────────────────────
# UORA Leaderboard — Next.js 16 production image (multi-stage, standalone output)
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* must be present at build time (they're inlined into the bundle).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_REFERENCE_ENGINE_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_REFERENCE_ENGINE_URL=${NEXT_PUBLIC_REFERENCE_ENGINE_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN groupadd -r nodejs && useradd -r -g nodejs nextjs
# Standalone output bundles only what's needed.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
