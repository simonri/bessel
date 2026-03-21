FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ui/package.json ./packages/ui/
COPY packages/client/package.json ./packages/client/
COPY packages/tsconfig/package.json ./packages/tsconfig/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
COPY tsconfig.json ./

# Build
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN pnpm --filter @metron/web build

# --- Runtime: serve static files with lightweight server ---
FROM node:22-slim

RUN npm install -g serve@14

RUN groupadd --gid 1000 appgroup && \
    useradd --uid 1000 --gid appgroup --shell /bin/bash --create-home appuser

WORKDIR /app

COPY --from=builder --chown=appuser:appgroup /app/apps/web/dist/client ./dist

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl --fail http://localhost:3000 || exit 1

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
