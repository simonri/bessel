# CLAUDE.md

## Overview

Metron is an open source payment infrastructure platform for developers. It's a monorepo consisting of:

- **Backend**: Python/FastAPI API server with PostgreSQL, Redis, and S3 storage
- **Frontend**: Next.js web application with TypeScript
- **Workers**: Dramatiq background job processors

## Commands

### Backend Development

```bash
cd services/api

# Install dependencies (requires uv)
uv sync

# Apply database migrations
uv run task db_migrate

# Start API server (http://127.0.0.1:8000)
uv run task api

# Start background worker
uv run task worker

# Run tests
uv run task test          # with coverage
uv run task test_fast     # faster, parallel execution

# Linting and formatting
uv run task lint          # auto-fix
uv run task lint_check    # check only
uv run task lint_types    # type checking with mypy

# Generate Alembic migration
uv run alembic revision --autogenerate -m "<description>"
```

### Frontend Development

```bash
cd apps/web-new

# Install dependencies (requires pnpm)
pnpm install

# Start development server (http://127.0.0.1:3000)
pnpm dev

# Build production bundle
pnpm build

# Run linting
pnpm lint

# Generate API client from OpenAPI spec
make clients
```

### Docker Services (Backend)

```bash
cd services/api
docker compose up -d  # Start PostgreSQL, Redis
```

## Architecture

### Backend Structure

- **`services/api/`**: Core application code organized into modules
    - Each module typically contains:
        - `endpoints.py`: FastAPI route handlers
        - `service.py`: Business logic layer
        - `repository.py`: Database access layer (SQLAlchemy)
        - `schemas.py`: Pydantic models for API validation
        - `auth.py`: Module-specific authentication
        - `tasks.py`: Dramatiq background tasks
    - **`models/`**: Global SQLAlchemy models (exception to modular structure)
    - **`migrations/`**: Alembic database migrations

### Frontend Structure

- **`apps/web-new/`**: Main Next.js dashboard application
- **`packages/`**: Shared packages
    - `ui/`: React components (Radix UI + Tailwind)
    - `client/`: Generated TypeScript API client

### Authentication System

- Uses `AuthSubject[T]` type where T can be: User, Organization, Customer, or Anonymous
- Module-specific authenticators defined in `auth.py` files
- Scopes control access to operations (e.g., `web_default`, `discounts_write`)
- Web-specific dependencies: `WebUser`, `WebUserOrAnonymous`, `AdminUser`

## Key Integrations

- **S3**: File storage
- **Redis**: Cache and job queue
- **PostgreSQL**: Primary database

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

In most cases, you should never call `session.commit()` directly in business logic. We have established patterns for that: the API backend automatically commits the session at the end of each request, and background workers commit the session at the end of each task. It avoids to have a database in an inconsistent state in case of exceptions. If you have a `session.commit()` in your code, it's likely a mistake. Otherwise, please explicitly document why it's necessary.

If you need to ensure that data is flushed to the database, to run constraints or fill server defaults, use `session.flush()` instead. Bear in mind though that it might not be necessary, as SQLAlchemy automatically flushes pending changes before read operations.

### Frontend

- Use TanStack Query for data fetching
- State management with Zustand
- UI components from shared `@metron/ui` package
- Follow React Router conventions
- Tailwind CSS for styling

### Testing

- Backend: pytest with class-based test organization
- Use existing fixtures and avoid redundant setup
- Mock external services appropriately

IMPORTANT: Write code at a level that would be accepted to OpenAI or Anthropic's internal production monorepos.