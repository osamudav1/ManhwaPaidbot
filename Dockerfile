# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Multi-stage Dockerfile for the Telegram Manhwa Bot (api-server artifact).
# Built for Render, but portable to any Docker host (Fly, Railway, VPS, etc.).
# ---------------------------------------------------------------------------

# ===== Stage 1: Builder =====================================================
FROM node:24-slim AS builder

WORKDIR /app

# Enable pnpm via corepack (bundled with Node 24)
RUN corepack enable && corepack prepare pnpm@10 --activate

# Copy workspace manifests first so Docker can cache the install layer
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy every workspace package.json so pnpm can resolve the workspace graph.
# (Listing them explicitly keeps the install layer cacheable.)
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY scripts/package.json ./scripts/

# Install only the api-server's dependency tree (and its workspace deps).
# Dev deps are needed because esbuild bundles at build time.
RUN pnpm install --frozen-lockfile --filter @workspace/api-server...

# Copy the source code needed for the build
COPY lib ./lib
COPY artifacts/api-server ./artifacts/api-server

# Bundle to a single dist/index.mjs (esbuild handles externals + pino workers)
RUN pnpm --filter @workspace/api-server run build

# ===== Stage 2: Runtime =====================================================
FROM node:24-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0

# Only copy the bundled output — everything is self-contained
COPY --from=builder /app/artifacts/api-server/dist ./dist

# Render injects PORT at runtime. Expose the default for clarity / local docker run.
EXPOSE 8080

# Use the unprivileged "node" user that ships with the official image
USER node

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
