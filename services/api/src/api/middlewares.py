import re
import uuid

import dramatiq
import structlog
from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from api.settings import settings
from api.worker import JobQueueManager

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9-]{8,64}$")


class FlushEnqueuedWorkerJobsMiddleware:
  def __init__(self, app: ASGIApp) -> None:
    self.app = app

  async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
    if scope["type"] not in ("http", "websocket"):
      await self.app(scope, receive, send)
      return

    async with JobQueueManager.open(dramatiq.get_broker(), scope["state"]["redis"]):
      await self.app(scope, receive, send)


class RequestContextMiddleware:
  """Tags every log line of a request with its id and the calling client.

  The id is the client's X-Request-ID when it sent a sane one, so a report from
  the app can be matched to server logs; it's echoed back on the response.
  """

  def __init__(self, app: ASGIApp) -> None:
    self.app = app

  async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
    if scope["type"] != "http":
      await self.app(scope, receive, send)
      return

    headers = Headers(scope=scope)
    request_id = headers.get(REQUEST_ID_HEADER, "")
    if not _REQUEST_ID_PATTERN.match(request_id):
      request_id = uuid.uuid4().hex

    context = {"request_id": request_id}
    if platform := headers.get("X-Client-Platform"):
      context["client"] = f"{platform[:16]}/{headers.get('X-Client-Version', '?')[:16]}+{headers.get('X-Client-Build', '?')[:16]}"

    async def send_with_id(message: Message) -> None:
      if message["type"] == "http.response.start":
        MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
      await send(message)

    with structlog.contextvars.bound_contextvars(**context):
      await self.app(scope, receive, send_with_id)


class MinimumClientVersionMiddleware:
  """Turns away iOS builds older than IOS_MIN_BUILD with 426, which the app
  answers with an update screen. Anything without a build header passes."""

  def __init__(self, app: ASGIApp) -> None:
    self.app = app

  async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
    if scope["type"] != "http" or settings.IOS_MIN_BUILD <= 0:
      await self.app(scope, receive, send)
      return

    headers = Headers(scope=scope)
    build = headers.get("X-Client-Build", "")
    if headers.get("X-Client-Platform") == "ios" and build.isdigit() and int(build) < settings.IOS_MIN_BUILD:
      response = JSONResponse(
        status_code=426,
        content={"error": "UpgradeRequired", "detail": "This version of Bessel is no longer supported. Update to keep going."},
      )
      await response(scope, receive, send)
      return

    await self.app(scope, receive, send)
