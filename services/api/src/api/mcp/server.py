from urllib.parse import urlsplit

from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import Icon
from pydantic import AnyHttpUrl
from starlette.routing import Route

from api.mcp.auth import Auth0TokenVerifier
from api.mcp.prompts import PROMPTS
from api.mcp.tools import TOOLS
from api.settings import Environment, settings

INSTRUCTIONS = """\
The user's Bessel life dashboard: tasks, calendar, contacts, money and investments, recipes, \
sleep, workouts, lifts from the gym log, daily steps and heart rate, computer activity, \
and the weather anywhere (from Yr). Tasks and recipes can be created and updated, \
and calendar events added; contacts and money are read-only, and nothing can be deleted.

Days can be written as YYYY-MM-DD or relative ("today", "fri", "next week"), and \
default to the user's own timezone. Durations are in seconds. Money is in currency \
units (1299.5 SEK), never öre or cents, and currencies are never added together. \
The user also owns an aktiebolag: its accounts and costs are marked as the company's \
and kept out of the user's personal spending. Start a planning or review \
conversation with get_task_overview, and a money one with get_finances_overview.\
"""


def build_server() -> MCPServer:
  if settings.ENV == Environment.production and not settings.MCP_RESOURCE_URL.startswith("https://"):
    raise ValueError("MCP_RESOURCE_URL must be the public https:// URL of /mcp in production")
  server = MCPServer(
    name="bessel",
    title="Bessel",
    instructions=INSTRUCTIONS,
    website_url=settings.FRONTEND_BASE_URL,
    # A full square: clients round it themselves, and transparent corners show as a light edge.
    icons=[Icon(src=settings.generate_frontend_url("icon.png"), mime_type="image/png", sizes=["512x512"])],
    token_verifier=Auth0TokenVerifier(),
    auth=AuthSettings(
      issuer_url=AnyHttpUrl(f"https://{settings.AUTH0_DOMAIN}/"),
      resource_server_url=AnyHttpUrl(settings.MCP_RESOURCE_URL),
      validate_token_resource=True,
    ),
  )
  for tool in TOOLS:
    server.add_tool(tool.fn, title=tool.title, annotations=tool.annotations)
  for prompt in PROMPTS:
    server.prompt(name=prompt.name, title=prompt.title, description=prompt.description)(prompt.fn)
  return server


def _transport_security() -> TransportSecuritySettings:
  allowed_hosts = [urlsplit(settings.MCP_RESOURCE_URL).netloc]
  # Claude's hosted connectors call from Anthropic's servers; allow its origin
  # in case a request carries one.
  allowed_origins = ["https://claude.ai"]
  if settings.is_development():
    # MCP Inspector and other local clients.
    allowed_hosts += ["localhost:*", "127.0.0.1:*"]
    allowed_origins += ["http://localhost:*", "http://127.0.0.1:*"]
  return TransportSecuritySettings(enable_dns_rebinding_protection=True, allowed_hosts=allowed_hosts, allowed_origins=allowed_origins)


def build_routes(server: MCPServer) -> list[Route]:
  """Routes for `/mcp` and its OAuth protected resource metadata.

  Each forwards to the SDK's app (which applies bearer auth and host checks)
  with the path untouched: the SDK routes on absolute paths, and the metadata
  lives under `/.well-known/`. Exact routes rather than a root `Mount` keep
  404s and 405s elsewhere in the API intact. The SDK app's lifespan doesn't
  run this way, so the caller must run `server.session_manager.run()`.
  """
  mcp_app = server.streamable_http_app(
    streamable_http_path=urlsplit(settings.MCP_RESOURCE_URL).path,
    stateless_http=True,
    json_response=True,
    transport_security=_transport_security(),
  )
  return [Route(route.path, mcp_app, include_in_schema=False) for route in mcp_app.routes if isinstance(route, Route)]
