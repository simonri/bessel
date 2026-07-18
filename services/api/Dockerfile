# syntax=docker/dockerfile:1.7
FROM python:3.14-slim-bookworm AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
COPY packages/python_client/ ./packages/python_client/
COPY services/api/ ./services/api/

RUN --mount=type=cache,target=/root/.cache/uv \
    uv venv /opt/venv && \
    . /opt/venv/bin/activate && \
    uv pip install ./packages/python_client ./services/api

# --- Runtime ---
FROM python:3.14-slim-bookworm

RUN groupadd --gid 1000 appgroup && \
    useradd --uid 1000 --gid appgroup --shell /bin/bash --create-home appuser

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    procps \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH="/app/services/api/src:/app/packages/python_client/src"

COPY --from=builder --chown=appuser:appgroup /opt/venv /opt/venv

WORKDIR /app

COPY --chown=appuser:appgroup packages/python_client/src/ ./packages/python_client/src/
COPY --chown=appuser:appgroup services/api/src/ ./services/api/src/
COPY --chown=appuser:appgroup services/api/alembic.ini ./services/api/
COPY --chown=appuser:appgroup services/api/migrations/ ./services/api/migrations/
COPY --chown=appuser:appgroup services/api/db.py ./services/api/

USER appuser
WORKDIR /app/services/api

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl --fail http://localhost:8000/healthz || exit 1

EXPOSE 8000

CMD ["uvicorn", "api.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--timeout-keep-alive", "65"]
