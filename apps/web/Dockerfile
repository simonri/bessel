FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ui/package.json ./packages/ui/
COPY packages/client/package.json ./packages/client/
COPY packages/tsconfig/package.json ./packages/tsconfig/

# Install dependencies (ignore-scripts skips vite-plus prepare hook that needs git)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
COPY tsconfig.json ./

# Build (use vite directly — vp build requires a daemon not available in Docker)
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV PATH="/app/node_modules/.bin:$PATH"
RUN cd apps/web && vite build

# --- Runtime: serve static files with lightweight server ---
FROM node:22-slim

RUN npm install -g serve@14 && apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder --chown=node:node /app/apps/web/dist/client ./dist

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl --fail http://localhost:3000 || exit 1

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
