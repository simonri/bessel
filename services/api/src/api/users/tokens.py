import base64
import hmac
from hashlib import sha256
from uuid import UUID

from api.settings import settings

# Use first 8 bytes of HMAC for shorter tokens (64 bits of security)
SIGNATURE_LENGTH = 8


def _get_secret() -> bytes:
  return settings.UNSUBSCRIBE_TOKEN_SECRET.encode()


def generate_unsubscribe_token(user_id: UUID) -> str:
  """
  Generate a short, URL-safe unsubscribe token for a user.

  Token format: base64url(user_id_bytes + hmac_signature[:8])
  - user_id: 16 bytes (UUID)
  - signature: 8 bytes (truncated HMAC-SHA256)
  - Total: 24 bytes = 32 characters base64url
  """
  user_id_bytes = user_id.bytes
  signature = hmac.new(_get_secret(), user_id_bytes, sha256).digest()[:SIGNATURE_LENGTH]
  token_bytes = user_id_bytes + signature
  return base64.urlsafe_b64encode(token_bytes).decode().rstrip("=")


def verify_unsubscribe_token(token: str) -> UUID | None:
  """
  Verify an unsubscribe token and extract the user_id.

  Returns the user_id if valid, None if invalid.
  """
  # Add padding if needed
  padding = 4 - (len(token) % 4)
  if padding != 4:
    token += "=" * padding

  try:
    token_bytes = base64.urlsafe_b64decode(token)
  except Exception:
    return None

  expected_length = 16 + SIGNATURE_LENGTH  # UUID + signature
  if len(token_bytes) != expected_length:
    return None

  user_id_bytes = token_bytes[:16]
  provided_signature = token_bytes[16:]

  expected_signature = hmac.new(_get_secret(), user_id_bytes, sha256).digest()[:SIGNATURE_LENGTH]

  if not hmac.compare_digest(provided_signature, expected_signature):
    return None

  return UUID(bytes=user_id_bytes)
