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

JWKS_CACHE_TTL = 3600


class JWKSClient:
  _jwks: dict | None = None
  _cache_timestamp: float = 0

  @classmethod
  def _is_cache_valid(cls) -> bool:
    if cls._jwks is None:
      return False
    return (time.monotonic() - cls._cache_timestamp) < JWKS_CACHE_TTL

  @classmethod
  async def get_jwks(cls) -> dict | None:
    if not cls._is_cache_valid():
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


async def _get_signing_key(token: str) -> dict:
  jwks = await JWKSClient.get_jwks()
  unverified_header = jwt.get_unverified_header(token)
  for key in (jwks or {}).get("keys", []):
    if key.get("kid") == unverified_header.get("kid"):
      return key
  raise HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Unable to find appropriate signing key",
    headers={"WWW-Authenticate": "Bearer"},
  )


async def verify_token(
  credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
) -> UserInfo:
  token = credentials.credentials
  try:
    signing_key = await _get_signing_key(token)
    payload = jwt.decode(
      token,
      signing_key,
      algorithms=settings.AUTH0_ALGORITHMS,
      audience=settings.AUTH0_AUDIENCE,
      issuer=f"https://{settings.AUTH0_DOMAIN}/",
    )
    return UserInfo(
      sub=payload["sub"],
      email=payload.get("email"),
      name=payload.get("name"),
      picture=payload.get("picture"),
    )
  except JWTError as e:
    log.warning("JWT verification failed", error=str(e))
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Invalid or expired token",
      headers={"WWW-Authenticate": "Bearer"},
    ) from None


CurrentUser = Annotated[UserInfo, Depends(verify_token)]
