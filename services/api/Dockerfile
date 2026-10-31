# syntax=docker/dockerfile:1.7
FROM python:3.12-slim-bookworm AS builder

COPY --from=ghcr.io/astral-sh/uv:0.11.18 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv

WORKDIR /app

# Dependencies only, from the lockfile: this layer is rebuilt (and pulled) only when they change.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=services/api/pyproject.toml,target=services/api/pyproject.toml \
    uv sync --frozen --no-dev --package api --no-install-workspace

# --- Runtime ---
FROM python:3.12-slim-bookworm

RUN groupadd --gid 1000 appgroup && \
    useradd --uid 1000 --gid appgroup --shell /bin/bash --create-home appuser

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    procps \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH="/app/services/api/src"

# The memory embedding model is downloaded here on first use; production mounts a volume so it survives deploys.
RUN mkdir -p /models && chown appuser:appgroup /models

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app/services/api

COPY services/api/alembic.ini services/api/db.py ./
COPY services/api/migrations/ ./migrations/
COPY services/api/src/ ./src/

USER appuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --start-interval=2s --retries=3 \
    CMD curl --fail http://localhost:8000/healthz || exit 1

EXPOSE 8000

CMD ["uvicorn", "api.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--timeout-keep-alive", "65", "--timeout-graceful-shutdown", "10"]
