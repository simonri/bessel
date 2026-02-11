import json

from src.api.app import app

openapi = app.openapi()

with open("openapi.json", "w") as f:
  json.dump(openapi, f, indent=2)

print(f"Generated OpenAPI spec with {len(openapi.get('paths', {}))} paths")
