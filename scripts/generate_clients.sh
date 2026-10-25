#!/usr/bin/env bash
# Regenerates the OpenAPI spec from the API's code and the TypeScript client from the spec.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Exporting the OpenAPI spec..."
(cd "$ROOT/services/api" && uv run --frozen python export_openapi.py)

echo "Generating the TypeScript client..."
(cd "$ROOT/packages/client" && pnpm exec openapi-ts)
