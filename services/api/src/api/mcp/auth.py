import structlog
from mcp.server.auth.provider import AccessToken

from api.auth.dependencies import InvalidTokenError, decode_access_token
from api.settings import settings

log = structlog.get_logger()


class Auth0TokenVerifier:
  """Accepts Auth0 access tokens issued for this MCP server's resource URL.

  Tokens for the web API (`AUTH0_AUDIENCE`) are rejected: Claude requests
  tokens with the RFC 8707 `resource` parameter, which Auth0 maps to the API
  whose identifier equals `MCP_RESOURCE_URL`.
  """

  async def verify_token(self, token: str) -> AccessToken | None:
    try:
      claims = await decode_access_token(token, audience=settings.MCP_RESOURCE_URL)
    except InvalidTokenError as e:
      log.info("mcp.token_rejected", error=str(e))
      return None

    return AccessToken(
      token=token,
      client_id=claims.get("azp") or claims.get("client_id") or "",
      scopes=claims.get("scope", "").split(),
      expires_at=claims.get("exp"),
      resource=settings.MCP_RESOURCE_URL,
      subject=claims["sub"],
      claims={"iss": claims["iss"]},
    )
