FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ui/package.json ./packages/ui/
COPY packages/client/package.json ./packages/client/
COPY packages/tsconfig/package.json ./packages/tsconfig/

# Init a git repo so vite-plus prepare hook succeeds
RUN git init

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
COPY tsconfig.json ./

# Build — resolve vite binary from pnpm store (vp build needs a daemon)
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN VITE_BIN=$(find /app/node_modules -path "*/vite-plus-core/bin/vite.js" -print -quit) \
    && cd apps/web && node "$VITE_BIN" build \
    && ls -la dist/ && ls -la dist/client/ 2>/dev/null || true

# --- Runtime: serve static files with lightweight server ---
FROM node:22-slim

RUN npm install -g serve@14 && apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# TanStack Start SPA outputs to dist/client/
COPY --from=builder --chown=node:node /app/apps/web/dist/ ./dist/

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl --fail http://localhost:3000 || exit 1

EXPOSE 3000

CMD ["sh", "-c", "if [ -d dist/client ]; then serve -s dist/client -l 3000; else serve -s dist -l 3000; fi"]
