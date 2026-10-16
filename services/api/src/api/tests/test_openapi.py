import importlib
from pathlib import Path

import api
import pytest
from fastapi.routing import APIRoute
from httpx import AsyncClient


def _endpoint_module_routes() -> dict[str, list[APIRoute]]:
  routes: dict[str, list[APIRoute]] = {}
  for path in Path(api.__file__).parent.glob("*/endpoints.py"):
    endpoints = importlib.import_module(f"api.{path.parent.name}.endpoints")
    routes[path.parent.name] = [r for r in endpoints.router.routes if isinstance(r, APIRoute) and r.include_in_schema]
  return routes


@pytest.mark.asyncio
async def test_openapi_schema_documents_every_endpoint_module(client: AsyncClient) -> None:
  response = await client.get("/openapi.json")
  assert response.status_code == 200
  documented = {(path, method.upper()) for path, operations in response.json()["paths"].items() for method in operations}

  modules = _endpoint_module_routes()
  assert len(modules) >= 20
  for name, routes in modules.items():
    expected = {(f"/v1{route.path}", method) for route in routes for method in route.methods}
    assert expected, name
    assert expected <= documented, f"{name} endpoints missing from the schema: {sorted(expected - documented)}"


@pytest.mark.asyncio
async def test_openapi_file_uploads_are_binary(client: AsyncClient) -> None:
  response = await client.get("/openapi.json")
  schemas = response.json()["components"]["schemas"]

  for name in ("Body_upload_task_attachment_v1_tasks__task_id__attachments_post", "Body_import_transactions_v1_transactions_import_post"):
    assert schemas[name]["properties"]["file"]["format"] == "binary"
