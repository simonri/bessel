#!/usr/bin/env bash
# Fails when the API spec breaks clients built against the spec at a base commit.
#
# Old desktop builds bundle an older web app and the iOS app has its own models,
# so a removed field or a newly required input breaks installs that can't update
# in step with the server. A commit between the base and HEAD carrying a
# `Breaking-API: <reason>` trailer lets an intended break through.
#
# Usage: scripts/check_api_compat.sh <base-ref>
set -euo pipefail

OASDIFF_IMAGE="tufin/oasdiff:v1.34.0"
SPEC="services/api/openapi.json"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${1:?usage: check_api_compat.sh <base-ref>}"

if ! git -C "$ROOT" cat-file -e "$BASE:$SPEC" 2>/dev/null; then
  echo "No spec at $BASE to compare against."
  exit 0
fi

specs="$(mktemp -d)"
trap 'rm -rf "$specs"' EXIT
git -C "$ROOT" show "$BASE:$SPEC" > "$specs/base.json"
cp "$ROOT/$SPEC" "$specs/head.json"

allowed="$(git -C "$ROOT" log --format=%B "$BASE..HEAD" | grep -m1 '^Breaking-API:' || true)"
fail_on=(--fail-on ERR)
if [ -n "$allowed" ]; then
  echo "Breaking changes are allowed by a commit trailer: $allowed"
  fail_on=()
fi

if docker run --rm -v "$specs:/specs:ro" "$OASDIFF_IMAGE" breaking /specs/base.json /specs/head.json "${fail_on[@]}"; then
  if [ -z "$allowed" ]; then
    echo "No change that breaks existing clients."
  fi
else
  echo "::error::This API change breaks clients already installed (old desktop builds, the iOS app). Make it backward compatible, or add a 'Breaking-API: <reason>' trailer to the commit." >&2
  exit 1
fi
