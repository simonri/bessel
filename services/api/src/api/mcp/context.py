from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from mcp.server.auth.middleware.bearer_auth import AuthenticatedUser
from mcp.server.mcpserver import Context
from mcp.server.mcpserver.exceptions import ToolError
from starlette.requests import Request

from api.exceptions import BesselError
from api.models.user import User
from api.postgres import AsyncSession
from api.users.service import user_service


@asynccontextmanager
async def user_session(ctx: Context) -> AsyncIterator[tuple[AsyncSession, User]]:
  """The request's database session and the Bessel user the bearer token belongs to.

  Changes are committed whenever the tool ran to an answer; write tools check
  their input before changing anything, so a client error like "not found"
  commits nothing but the user row created on first login. Only unexpected
  failures roll back. Client errors are
  re-raised as `ToolError` so their message reaches the model, while anything
  else stays opaque.
  """
  request = ctx.request_context.request
  if not isinstance(request, Request):
    raise RuntimeError("MCP tools are only served over HTTP")
  auth_user = request.scope.get("user")
  if not isinstance(auth_user, AuthenticatedUser) or auth_user.access_token.subject is None:
    raise ToolError("Not authenticated")

  session: AsyncSession = request.state.async_session
  try:
    user = await user_service.get_or_create_by_sub(session, auth_user.access_token.subject, None)
    yield session, user
  except ToolError:
    await session.commit()
    raise
  except BesselError as e:
    if e.status_code >= 500:
      await session.rollback()
      raise
    await session.commit()
    raise ToolError(e.message) from e
  except Exception:
    await session.rollback()
    raise
  else:
    await session.commit()
