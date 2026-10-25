#!/usr/bin/env bash
# Fails when the committed OpenAPI spec or generated client doesn't match the API's code.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$ROOT/scripts/generate_clients.sh"

if ! git -C "$ROOT" diff --exit-code --stat -- services/api/openapi.json packages/client/src; then
  echo "::error::The generated API client is out of date. Run 'make clients' and commit the result." >&2
  exit 1
fi
if [ -n "$(git -C "$ROOT" ls-files --others --exclude-standard -- packages/client/src)" ]; then
  echo "::error::'make clients' created files that aren't committed:" >&2
  git -C "$ROOT" ls-files --others --exclude-standard -- packages/client/src >&2
  exit 1
fi
echo "Spec and client match the API."
