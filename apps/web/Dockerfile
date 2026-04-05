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

# Init a git repo so vite-plus prepare hook succeeds, install deps
RUN git init && pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
COPY tsconfig.json ./

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Build client + server bundles. Prerender may fail in Docker (needs a
# preview server), so ignore its exit code and generate a minimal SPA
# index.html from the build artifacts when prerender didn't produce one.
RUN (pnpm --filter web build || true) && \
    if [ ! -f apps/web/dist/client/index.html ]; then \
      MAIN_JS=$(basename $(ls apps/web/dist/client/assets/main-*.js)) && \
      MAIN_CSS=$(basename $(ls apps/web/dist/client/assets/styles-*.css)) && \
      printf '<!DOCTYPE html><html lang="en" class="dark font-sans"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Metron</title><link rel="icon" href="/favicon.ico" type="image/png"/><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous"/><link rel="stylesheet" href="/assets/%s"/><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap"/></head><body class="antialiased"><script type="module" async>import("/assets/%s")</script></body></html>' \
        "$MAIN_CSS" "$MAIN_JS" > apps/web/dist/client/index.html; \
    fi

# --- Runtime ---
FROM node:22-slim

RUN npm install -g serve@14 && apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder --chown=node:node /app/apps/web/dist/client ./dist

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl --fail http://localhost:3000 || exit 1

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
