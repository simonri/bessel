import dramatiq
from starlette.types import ASGIApp, Receive, Scope, Send

from api.worker import JobQueueManager


class FlushEnqueuedWorkerJobsMiddleware:
  def __init__(self, app: ASGIApp) -> None:
    self.app = app

  async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
    if scope["type"] not in ("http", "websocket"):
      await self.app(scope, receive, send)
      return

    async with JobQueueManager.open(dramatiq.get_broker(), scope["state"]["redis"]):
      await self.app(scope, receive, send)
