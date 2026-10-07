"""Idempotency-Key support for writes.

A client that sends a change and loses the response can't tell whether it was
applied. With an Idempotency-Key it can send the same request again: if the
first one succeeded, the stored response is replayed instead of applying the
change twice (a second task, a second recipe).

Only successful responses are stored, and only once the endpoint, including its
database commit, has finished. Keys are scoped to the verified account, so one
user's key can never return another user's response.
"""

import base64
import hashlib
import json
from collections.abc import Awaitable, Callable

import structlog
from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from api.auth.dependencies import InvalidTokenError, decode_access_token
from api.logging import Logger
from api.redis import Redis
from api.settings import settings

log: Logger = structlog.get_logger()

IDEMPOTENCY_HEADER = "Idempotency-Key"
REPLAYED_HEADER = "Idempotent-Replayed"
MAX_KEY_LENGTH = 128
# Long enough for a request that's still running to finish before the lock lapses.
IN_PROGRESS_TTL_SECONDS = 60
STORED_TTL_SECONDS = 24 * 60 * 60
MAX_STORED_BODY_BYTES = 256 * 1024
_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Headers that describe the stored body and are safe to send again.
_REPLAYED_HEADERS = {"content-type", "location"}

type Identify = Callable[[Scope], Awaitable[str | None]]
type GetRedis = Callable[[Scope], Redis]


async def identify_bearer(scope: Scope) -> str | None:
  """The verified account behind the request's bearer token, or None.

  Verified here, not just decoded: an unverified `sub` would let a forged token
  read someone else's stored response."""
  authorization = Headers(scope=scope).get("Authorization", "")
  scheme, _, token = authorization.partition(" ")
  if scheme.lower() != "bearer" or not token:
    return None
  try:
    claims = await decode_access_token(token, audience=settings.AUTH0_AUDIENCE)
  except InvalidTokenError:
    return None
  sub = claims.get("sub")
  return sub if isinstance(sub, str) else None


def _redis_from_state(scope: Scope) -> Redis:
  return scope["state"]["redis"]


class IdempotencyMiddleware:
  def __init__(self, app: ASGIApp, identify: Identify = identify_bearer, get_redis: GetRedis = _redis_from_state) -> None:
    self.app = app
    self.identify = identify
    self.get_redis = get_redis

  async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
    if scope["type"] != "http" or scope["method"] not in _WRITE_METHODS:
      await self.app(scope, receive, send)
      return

    key = Headers(scope=scope).get(IDEMPOTENCY_HEADER)
    if not key:
      await self.app(scope, receive, send)
      return
    if len(key) > MAX_KEY_LENGTH:
      await _error(scope, receive, send, 400, f"{IDEMPOTENCY_HEADER} is longer than {MAX_KEY_LENGTH} characters.")
      return

    account = await self.identify(scope)
    if account is None:
      # Unauthenticated: let the endpoint turn it away as usual.
      await self.app(scope, receive, send)
      return

    body = await _read_body(receive)
    fingerprint = hashlib.sha256(b"\n".join([scope["method"].encode(), scope["path"].encode(), scope.get("query_string", b""), body])).hexdigest()
    redis = self.get_redis(scope)
    redis_key = f"idempotency:{hashlib.sha256(account.encode()).hexdigest()[:32]}:{key}"

    claimed = await redis.set(redis_key, json.dumps({"state": "in_progress", "fingerprint": fingerprint}), nx=True, ex=IN_PROGRESS_TTL_SECONDS)
    if not claimed:
      await self._answer_existing(redis_key, fingerprint, key, scope, receive, send)
      return

    status: int | None = None
    response_headers: list[tuple[bytes, bytes]] = []
    chunks: list[bytes] = []

    async def capture(message: Message) -> None:
      nonlocal status, response_headers
      if message["type"] == "http.response.start":
        status = message["status"]
        response_headers = list(message.get("headers", []))
        MutableHeaders(scope=message)[IDEMPOTENCY_HEADER] = key
      elif message["type"] == "http.response.body":
        chunks.append(message.get("body", b""))
      await send(message)

    try:
      await self.app(scope, _replay(body, receive), capture)
    except BaseException:
      await redis.delete(redis_key)
      raise

    stored_body = b"".join(chunks)
    if status is None or not 200 <= status < 300 or len(stored_body) > MAX_STORED_BODY_BYTES:
      # Not a success worth replaying: a retry should run the request again.
      await redis.delete(redis_key)
      return

    record = {
      "state": "done",
      "fingerprint": fingerprint,
      "status": status,
      "headers": [[name.decode("latin-1"), value.decode("latin-1")] for name, value in response_headers if name.decode("latin-1").lower() in _REPLAYED_HEADERS],
      "body": base64.b64encode(stored_body).decode(),
    }
    await redis.set(redis_key, json.dumps(record), ex=STORED_TTL_SECONDS)

  async def _answer_existing(self, redis_key: str, fingerprint: str, key: str, scope: Scope, receive: Receive, send: Send) -> None:
    raw = await self.get_redis(scope).get(redis_key)
    if raw is None:
      # Expired or released between our claim and this read; the client retries.
      await _error(scope, receive, send, 409, "A request with this Idempotency-Key is still being processed.", {"Retry-After": "1", IDEMPOTENCY_HEADER: key})
      return

    record = json.loads(raw)
    if record["fingerprint"] != fingerprint:
      await _error(scope, receive, send, 422, f"This {IDEMPOTENCY_HEADER} was already used for a different request.")
      return
    if record["state"] != "done":
      await _error(scope, receive, send, 409, "A request with this Idempotency-Key is still being processed.", {"Retry-After": "1", IDEMPOTENCY_HEADER: key})
      return

    log.info("Replaying idempotent response", path=scope["path"], status=record["status"])
    headers = [(name.encode("latin-1"), value.encode("latin-1")) for name, value in record["headers"]]
    headers += [(IDEMPOTENCY_HEADER.lower().encode(), key.encode()), (REPLAYED_HEADER.lower().encode(), b"true")]
    await send({"type": "http.response.start", "status": record["status"], "headers": headers})
    await send({"type": "http.response.body", "body": base64.b64decode(record["body"])})


async def _read_body(receive: Receive) -> bytes:
  chunks: list[bytes] = []
  while True:
    message = await receive()
    if message["type"] != "http.request":
      break
    chunks.append(message.get("body", b""))
    if not message.get("more_body", False):
      break
  return b"".join(chunks)


def _replay(body: bytes, receive: Receive) -> Receive:
  """Hands the already-read body to the app, then passes through to the real
  connection, which only has its disconnect left to report."""
  sent = False

  async def replay() -> Message:
    nonlocal sent
    if not sent:
      sent = True
      return {"type": "http.request", "body": body, "more_body": False}
    return await receive()

  return replay


async def _error(scope: Scope, receive: Receive, send: Send, status: int, detail: str, headers: dict[str, str] | None = None) -> None:
  response = JSONResponse(status_code=status, content={"error": "IdempotencyError", "detail": detail}, headers=headers)
  await response(scope, receive, send)
