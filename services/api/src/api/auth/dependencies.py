import time
from typing import Annotated

import httpx
import structlog
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from api.auth.schemas import UserInfo
from api.settings import settings

log = structlog.get_logger()

security = HTTPBearer()

# JWKS cache TTL in seconds (1 hour)
JWKS_CACHE_TTL = 3600


class JWKSClient:
  """Client for fetching and caching Auth0 JWKS with TTL-based expiration."""

  _jwks: dict | None = None
  _jwks_uri: str | None = None
  _cache_timestamp: float = 0

  @classmethod
  def _is_cache_valid(cls) -> bool:
    """Check if the JWKS cache is still valid."""
    if cls._jwks is None:
      return False
    return (time.monotonic() - cls._cache_timestamp) < JWKS_CACHE_TTL

  @classmethod
  async def get_jwks(cls) -> dict:
    if not cls._is_cache_valid():
      cls._jwks_uri = f"https://{settings.AUTH0_DOMAIN}/.well-known/jwks.json"
      async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(cls._jwks_uri)
        response.raise_for_status()
        cls._jwks = response.json()
        cls._cache_timestamp = time.monotonic()
        log.debug("JWKS cache refreshed", uri=cls._jwks_uri)
    return cls._jwks

  @classmethod
  def clear_cache(cls) -> None:
    cls._jwks = None
    cls._cache_timestamp = 0


async def get_signing_key(token: str) -> dict:
  """Get the signing key from JWKS for a given token."""
  jwks = await JWKSClient.get_jwks()
  unverified_header = jwt.get_unverified_header(token)

  for key in jwks.get("keys", []):
    if key.get("kid") == unverified_header.get("kid"):
      return key

  raise HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Unable to find appropriate key",
    headers={"WWW-Authenticate": "Bearer"},
  )


async def verify_token(
  credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
) -> UserInfo:
  """Verify the JWT token and return user info."""
  token = credentials.credentials

  try:
    signing_key = await get_signing_key(token)

    payload = jwt.decode(
      token,
      signing_key,
      algorithms=settings.AUTH0_ALGORITHMS,
      audience=settings.AUTH0_AUDIENCE,
      issuer=f"https://{settings.AUTH0_DOMAIN}/",
    )

    # Extract roles from the token (Auth0 adds them under a custom namespace)
    # Common namespace patterns: https://{domain}/roles or the audience URL
    roles: list[str] = []
    for key in payload:
      if key.endswith("/roles") or key == "roles":
        roles = payload.get(key, [])
        break

    return UserInfo(
      sub=payload.get("sub", ""),
      email=payload.get("email"),
      name=payload.get("name"),
      picture=payload.get("picture"),
      roles=roles,
    )

  except JWTError as e:
    log.warning("JWT verification failed", error=str(e))
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Invalid token",
      headers={"WWW-Authenticate": "Bearer"},
    ) from None


async def require_admin(
  user: Annotated[UserInfo, Depends(verify_token)],
) -> UserInfo:
  """Require the user to have the admin role."""
  if "admin" not in user.roles:
    raise HTTPException(
      status_code=status.HTTP_403_FORBIDDEN,
      detail="Admin access required",
    )
  return user


# Type aliases for dependency injection
CurrentUser = Annotated[UserInfo, Depends(verify_token)]
AdminUser = Annotated[UserInfo, Depends(require_admin)]

