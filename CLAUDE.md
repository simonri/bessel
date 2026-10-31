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
uv run task test           # All tests, in parallel, with coverage
BESSEL_ENV=testing uv run python -m pytest src/api/tests/test_places.py -q   # One file
uv run task lint           # Format + lint with autofix (ruff)

uv run alembic revision --autogenerate -m "<description>"  # Generate migration
```

### Frontend

```bash
cd apps/web

pnpm install               # Install dependencies
pnpm dev                   # Start dev server (http://127.0.0.1:3001)
pnpm build                 # Build production bundle
pnpm test                  # Tests (vitest); one file: node_modules/.bin/vitest run <path>
node_modules/.bin/tsc --noEmit   # Types
```

If `pnpm` fails with a mise "No version is set" error, use `corepack pnpm`.

### Client Generation

```bash
# From repo root — exports the OpenAPI spec, then regenerates the TypeScript client and the iOS app's Swift models
make clients
make check-clients         # What CI runs: fails if the committed spec or client is stale
```

Run `make clients` after any change to an endpoint or schema and commit the result; deploys are blocked until the spec and client match the API.

Deploys are also blocked by changes that break clients already installed (old desktop builds bundle an older web app; the iOS app has its own models): removing a response field, adding a required input, narrowing an enum. Make the change backward compatible, or add a `Breaking-API: <reason>` trailer to the commit when the break is intended. Check locally with `scripts/check_api_compat.sh origin/master`.

### Docker Services

```bash
cd services/api
docker compose up -d       # Start PostgreSQL, Redis
```

## How work flows

Several Claude sessions work on this repo at once, each in its own git worktree under `.claude/worktrees/` on its own branch off `origin/master`.

- **Start**: in a fresh worktree, run `scripts/worktree-setup.sh` (env files from the main checkout, `pnpm install`, `uv sync`).
- **Stay in your worktree.** Never run commands in `/home/simon/dev/metron` itself: that is the user's checkout. Branches and the stash are shared by all worktrees; a hook refuses a bare `git stash`/`git stash pop`, force pushes and pushes to master.
- **One task per branch**, kept small. Commit as you go.
- **Done means checked.** `scripts/check.sh` lints, formats and type-checks what the branch changed (the Stop hook runs it and won't let you stop while it fails). Also run the tests covering your change, and the app for UI changes when you can. Report the commands you ran and their results.
- **Tests must fail when the code is broken**: break the code a new test covers, watch it go red, restore.
- **Merging happens only when the user asks.** Then run `scripts/land.sh`: it merges `origin/master` in, runs `scripts/check.sh --full`, pushes, opens the pull request if needed, waits for CI, merges and waits for the deploy. Never rebase or force-push a pushed branch. If a deploy fails, rerun it (`gh run rerun <id> --failed`) rather than fixing forward: a later push only deploys what it changed.
- **Migrations**: master must have one Alembic head. If master gained a migration since you branched, point yours at master's head (`down_revision`) instead of adding a merge revision.
- **Generated files** (`services/api/openapi.json`, `packages/client/src`, `apps/ios/Bessel/API/Generated`): never resolve conflicts by hand; take either side and run `make clients`.
- **Shared local services**: the dev database belongs to master. Don't run a branch's migrations against it, or start a worker from a branch (it would take the main checkout's jobs). Tests are safe: each run gets databases of its own. If you run the API or web dev server, use a port other than 8100/3001. Only one session at a time builds or runs the desktop app or the iOS app.
- **Handing back**: say what changed, the branch or PR, and how you verified it.

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

Write code at the level of a well-run production monorepo.
