import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_openapi(client: AsyncClient) -> None:
  response = await client.get("/openapi.json")
  assert response.status_code == 200

  schema = response.json()
  assert "HTTPValidationError" in schema["components"]["schemas"]


@pytest.mark.asyncio
async def test_openapi_file_uploads_are_binary(client: AsyncClient) -> None:
  response = await client.get("/openapi.json")
  schemas = response.json()["components"]["schemas"]

  for name in ("Body_upload_task_attachment_v1_tasks__task_id__attachments_post", "Body_import_transactions_v1_transactions_import_post"):
    assert schemas[name]["properties"]["file"]["format"] == "binary"
