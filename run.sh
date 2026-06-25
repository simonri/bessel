#!/usr/bin/env bash
set -euo pipefail

source /home/metron/.env.infisical

INFISICAL_TOKEN=$(infisical login \
  --method=universal-auth \
  --client-id="$INFISICAL_CLIENT_ID" \
  --client-secret="$INFISICAL_CLIENT_SECRET" \
  --plain \
  --silent)

exec infisical run \
  --projectId="$INFISICAL_PROJECT_ID" \
  --env=prod \
  --path=/ \
  --token="$INFISICAL_TOKEN" \
  -- "$@"
