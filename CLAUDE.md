# CLAUDE.md

## Overview

Bessel is a personal life dashboard. Monorepo with:

- **Backend**: Python/FastAPI API server with PostgreSQL, Redis
- **Frontend**: Vite+ / TanStack Start SPA with TypeScript
- **Workers**: Dramatiq background job processors

## Commands

### Backend

```bash
cd services/api

uv sync                    # Install dependencies
uv run task api            # Start API server (http://127.0.0.1:8100)
uv run task db_migrate     # Apply database migrations
uv run task worker         # Start background worker
uv run task test           # Run tests with coverage
uv run task lint           # Format + lint with autofix (ruff)

uv run alembic revision --autogenerate -m "<description>"  # Generate migration
```

### Frontend

```bash
cd apps/web

pnpm install               # Install dependencies
pnpm dev                   # Start dev server (http://127.0.0.1:3001)
pnpm build                 # Build production bundle
```

### Client Generation

```bash
# From repo root — exports OpenAPI spec then regenerates TS + Python clients
make clients
```

### Docker Services

```bash
cd services/api
docker compose up -d       # Start PostgreSQL, Redis
```

## Architecture

### Backend Structure

- **`services/api/src/api/`**: Code organized into modules (e.g. `places/`, `workouts/`, `transactions/`)
  - Each module typically contains:
    - `endpoints.py`: FastAPI route handlers
    - `service.py`: Business logic layer
    - `repository.py`: Database access layer (SQLAlchemy)
    - `schemas.py`: Pydantic models for API validation
  - **`models/`**: Global SQLAlchemy models (exception to modular structure)
  - **`migrations/`**: Alembic database migrations

### Frontend Structure

- **`apps/web/`**: Vite+ / TanStack Start SPA
- **`packages/`**: Shared packages
  - `ui/`: shadcn components (Radix UI + Tailwind v4)
  - `client/`: Auto-generated TypeScript API client (@hey-api/openapi-ts)

## Development Guidelines

### General

- Keep comments to the minimum, code should be self-explanatory.

### Backend

- Follow modular structure with service/repository pattern
- Use SQLAlchemy ORM consistently
- Proper async/await patterns with AsyncSession
- Repository methods should accept domain objects over IDs when available
- Include HTTP status codes in custom exceptions
- Use dependency injection for database sessions
- All DB queries should be in the Repository class. Use the right repository class.

Never call `session.commit()` directly in business logic. The API backend automatically commits the session at the end of each request, and background workers commit the session at the end of each task. Use `session.flush()` if you need to trigger constraints or fill server defaults.

### Frontend

- TanStack Query for data fetching, TanStack Router for routing, TanStack Form for forms
- UI components from shared `@bessel/ui` package (shadcn/Radix)
- Tailwind CSS v4 for styling
- File-based routing under `src/routes/`

### Testing

- Backend: pytest with class-based test organization
- Use existing fixtures and avoid redundant setup
- Mock external services appropriately

IMPORTANT: Write code at a level that would be accepted to OpenAI or Anthropic's internal production monorepos.
