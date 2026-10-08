FROM node:26-slim

RUN npm install -g serve@14 && apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Static files from CI build output (context = apps/web/dist/client)
COPY . ./dist

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl --fail http://localhost:3000 || exit 1

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
