import time
from typing import Annotated, Any

import httpx
import structlog
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from api.auth.schemas import UserInfo
from api.settings import settings

log = structlog.get_logger()

security = HTTPBearer()

JWKS_CACHE_TTL = 3600
# Minimum gap between refreshes triggered by an unknown key id, so tokens with
# random `kid`s can't make us hammer Auth0.
JWKS_MIN_REFRESH_INTERVAL = 60


class JWKSClient:
  _jwks: dict | None = None
  _cache_timestamp: float = 0

  @classmethod
  def _is_cache_valid(cls) -> bool:
    if cls._jwks is None:
      return False
    return (time.monotonic() - cls._cache_timestamp) < JWKS_CACHE_TTL

  @classmethod
  def can_force_refresh(cls) -> bool:
    return (time.monotonic() - cls._cache_timestamp) >= JWKS_MIN_REFRESH_INTERVAL

  @classmethod
  async def get_jwks(cls, *, force_refresh: bool = False) -> dict | None:
    if force_refresh or not cls._is_cache_valid():
      uri = f"https://{settings.AUTH0_DOMAIN}/.well-known/jwks.json"
      async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(uri)
        response.raise_for_status()
        cls._jwks = response.json()
        cls._cache_timestamp = time.monotonic()
        log.debug("JWKS cache refreshed", uri=uri)
    return cls._jwks

  @classmethod
  def clear_cache(cls) -> None:
    cls._jwks = None
    cls._cache_timestamp = 0


def _find_key(jwks: dict | None, kid: str | None) -> dict | None:
  for key in (jwks or {}).get("keys", []):
    if key.get("kid") == kid:
      return key
  return None


class InvalidTokenError(Exception):
  """The bearer token is malformed, expired, or not issued for the expected audience."""


async def _get_signing_key(token: str) -> dict | None:
  unverified_header = jwt.get_unverified_header(token)
  kid = unverified_header.get("kid")

  key = _find_key(await JWKSClient.get_jwks(), kid)
  if key is None and JWKSClient.can_force_refresh():
    # Unknown kid usually means Auth0 rotated its signing keys; refresh once
    # before rejecting, otherwise every login fails until the cache TTL expires.
    key = _find_key(await JWKSClient.get_jwks(force_refresh=True), kid)
  return key


async def decode_access_token(token: str, *, audience: str) -> dict[str, Any]:
  """Verify an Auth0 access token's signature, issuer, expiry and audience, and return its claims."""
  try:
    signing_key = await _get_signing_key(token)
    if signing_key is None:
      raise InvalidTokenError("Unable to find appropriate signing key")
    return jwt.decode(
      token,
      signing_key,
      algorithms=settings.AUTH0_ALGORITHMS,
      audience=audience,
      issuer=f"https://{settings.AUTH0_DOMAIN}/",
    )
  except JWTError as e:
    raise InvalidTokenError(str(e)) from e


async def verify_token(
  credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
) -> UserInfo:
  try:
    payload = await decode_access_token(credentials.credentials, audience=settings.AUTH0_AUDIENCE)
  except InvalidTokenError as e:
    log.warning("JWT verification failed", error=str(e))
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Invalid or expired token",
      headers={"WWW-Authenticate": "Bearer"},
    ) from None
  return UserInfo(
    sub=payload["sub"],
    email=payload.get("email"),
    name=payload.get("name"),
    picture=payload.get("picture"),
  )


CurrentUser = Annotated[UserInfo, Depends(verify_token)]
