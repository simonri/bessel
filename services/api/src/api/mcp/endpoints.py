from fastapi import APIRouter
from pydantic import Field

from api.common.schemas import Schema
from api.settings import settings

router = APIRouter(prefix="/mcp-connector", tags=["mcp"])


class MCPConnectorResponse(Schema):
  url: str = Field(description="The public address to add as a custom connector in Claude.")


@router.get(
  "",
  summary="Get MCP Connector",
  response_model=MCPConnectorResponse,
)
async def get_mcp_connector() -> MCPConnectorResponse:
  """Where Claude connects. The web app can't derive it: in production it calls the API on its own origin, while
  connector tokens are issued for the API's own address."""
  return MCPConnectorResponse(url=settings.MCP_RESOURCE_URL)
