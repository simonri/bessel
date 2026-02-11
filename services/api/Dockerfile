# syntax=docker/dockerfile:1.7
# Production Dockerfile for the API service
# Multi-stage build optimized for security, size, and cache efficiency

# ==============================================================================
# Stage 1: Builder - Install dependencies in isolated environment
# ==============================================================================
FROM python:3.12-slim-bookworm AS builder

# Prevent Python from writing bytecode and buffering stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast, reliable Python package management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy workspace configuration first (changes rarely)
COPY pyproject.toml uv.lock ./

# Copy local packages (full source needed for uv_build)
COPY packages/common/ ./packages/common/
COPY packages/python_client/ ./packages/python_client/

# Copy full service (source needed for build)
COPY services/api/ ./services/api/

# Install dependencies into a virtual environment
# This layer is cached unless pyproject.toml, uv.lock, or source changes
RUN --mount=type=cache,target=/root/.cache/uv \
    uv venv /opt/venv && \
    . /opt/venv/bin/activate && \
    uv pip install ./packages/common ./packages/python_client ./services/api

# ==============================================================================
# Stage 2: Email Builder - Build react-email binary
# ==============================================================================
FROM node:22-slim AS email-builder

WORKDIR /emails

# Copy email package files
COPY services/api/emails/package.json ./

# Install pnpm and dependencies
RUN corepack enable && \
    corepack prepare pnpm@latest --activate && \
    pnpm install

# Copy email source and build configuration
COPY services/api/emails/src ./src/
COPY services/api/emails/tsconfig.json services/api/emails/tsup.config.js ./

# Build the react-email binary
RUN pnpm run build

# ==============================================================================
# Stage 3: Runtime - Minimal production image
# ==============================================================================
FROM python:3.12-slim-bookworm AS runtime

# Security: Create non-root user before any file operations
RUN groupadd --gid 1000 appgroup && \
    useradd --uid 1000 --gid appgroup --shell /bin/bash --create-home appuser

# Install only runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Environment configuration
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH="/app/services/api/src:/app/packages/common/src:/app/packages/python_client/src"

# Copy virtual environment from builder
COPY --from=builder --chown=appuser:appgroup /opt/venv /opt/venv

# Copy react-email binary from email-builder
COPY --from=email-builder --chown=appuser:appgroup /emails/bin/react-email-pkg /app/services/api/src/emails/bin/react-email-pkg

WORKDIR /app

# Copy application source code
COPY --chown=appuser:appgroup packages/common/src/ ./packages/common/src/
COPY --chown=appuser:appgroup packages/python_client/src/ ./packages/python_client/src/
COPY --chown=appuser:appgroup services/api/src/ ./services/api/src/
COPY --chown=appuser:appgroup services/api/assets/ ./services/api/assets/
COPY --chown=appuser:appgroup services/api/alembic.ini ./services/api/
COPY --chown=appuser:appgroup services/api/migrations/ ./services/api/migrations/
COPY --chown=appuser:appgroup services/api/db.py ./services/api/

# Switch to non-root user
USER appuser

WORKDIR /app/services/api

# Health check - verify the service is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl --fail http://localhost:8000/health || exit 1

EXPOSE 8000

# Use exec form for proper signal handling (PID 1)
# --workers: Match to CPU cores in production (set via env or override)
# --timeout-keep-alive: Prevent connection drops behind load balancers
CMD ["uvicorn", "api.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--timeout-keep-alive", "65"]
