from functools import cache

from cryptography.fernet import Fernet, InvalidToken

from api.exceptions import InternalError
from api.settings import settings

__all__ = ["InvalidToken", "decrypt", "encrypt"]


@cache
def _fernet(key: str) -> Fernet:
  if not key:
    raise InternalError("CREDENTIALS_ENCRYPTION_KEY is not configured")
  return Fernet(key)


def encrypt(plaintext: str) -> str:
  return _fernet(settings.CREDENTIALS_ENCRYPTION_KEY).encrypt(plaintext.encode()).decode()


def decrypt(token: str, *, ttl: int | None = None) -> str:
  """Raises InvalidToken if the token was tampered with, or is older than `ttl` seconds."""
  return _fernet(settings.CREDENTIALS_ENCRYPTION_KEY).decrypt(token.encode(), ttl=ttl).decode()
