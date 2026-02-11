#!/bin/bash
set -e

echo "Exporting OpenAPI spec from API service..."

cd services/api
uv run python export_openapi.py
cd ../..

echo "Regenerating Python API client..."

rm -rf packages/python_client/src/openapi_client
mkdir -p packages/python_client/src/openapi_client

uvx openapi-python-client generate \
  --path services/api/openapi.json \
  --output-path packages/python_client/src/openapi_client \
  --overwrite \
  --meta none

echo "Regenerating TypeScript API client..."

cd packages/client
npx @hey-api/openapi-ts -i ../../services/api/openapi.json

# Add client export (not included by generator)
echo 'export { client } from "./client.gen";' >> src/index.ts

cd ../..

echo "Client generation complete!"
