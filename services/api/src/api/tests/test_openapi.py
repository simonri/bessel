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
    expected = {(f"/v1{route.path}", method) for route in routes for method in route.methods or ()}
    assert expected, name
    assert expected <= documented, f"{name} endpoints missing from the schema: {sorted(expected - documented)}"


@pytest.mark.asyncio
async def test_openapi_file_uploads_are_binary(client: AsyncClient) -> None:
  response = await client.get("/openapi.json")
  schemas = response.json()["components"]["schemas"]

  for name in ("Body_upload_task_attachment", "Body_import_transactions"):
    assert schemas[name]["properties"]["file"]["format"] == "binary"


def _operation_ids(schema: dict) -> list[str]:
  return [operation["operationId"] for operations in schema["paths"].values() for operation in operations.values()]


@pytest.mark.asyncio
async def test_operations_are_named_after_their_endpoint_functions(client: AsyncClient) -> None:
  schema = (await client.get("/openapi.json")).json()
  ids = _operation_ids(schema)
  names = {route.name for routes in _endpoint_module_routes().values() for route in routes}

  duplicates = sorted({operation_id for operation_id in ids if ids.count(operation_id) > 1})
  assert not duplicates, f"endpoint functions sharing a name, so generated clients would clash: {duplicates}"
  assert "update_task" in ids
  assert set(ids) - {"healthz"} <= names


@pytest.mark.asyncio
async def test_no_operation_type_name_collides_with_a_schema(client: AsyncClient) -> None:
  """The TypeScript client names each operation's types `<Operation>Data`, `<Operation>Response` and so on."""
  schema = (await client.get("/openapi.json")).json()
  schemas = set(schema["components"]["schemas"])
  suffixes = ("Data", "Response", "Responses", "Error", "Errors")

  collisions = sorted(
    f"{pascal}{suffix}"
    for pascal in ("".join(part.capitalize() for part in operation_id.split("_")) for operation_id in _operation_ids(schema))
    for suffix in suffixes
    if f"{pascal}{suffix}" in schemas
  )
  assert not collisions, f"rename the endpoint function or the schema: {collisions}"
