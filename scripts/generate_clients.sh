#!/usr/bin/env bash
# Regenerates the OpenAPI spec from the API's code, then the TypeScript client and Swift models from it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Exporting the OpenAPI spec..."
(cd "$ROOT/services/api" && uv run --frozen python export_openapi.py)

echo "Generating the TypeScript client..."
(cd "$ROOT/packages/client" && pnpm exec openapi-ts)

echo "Generating the iOS app's Swift models..."
python3 "$ROOT/scripts/generate_swift_models.py"
