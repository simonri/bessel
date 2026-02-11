from collections.abc import Sequence

from ratelimit import RateLimitMiddleware, Rule
from ratelimit.auths import EmptyInformation
from ratelimit.auths.ip import client_ip
from ratelimit.backends.redis import RedisBackend
from ratelimit.types import ASGIApp, Scope

from api.enums import RateLimitGroup
from api.redis import create_redis
from api.settings import Environment, settings


async def _authenticate(scope: Scope) -> tuple[str, RateLimitGroup]:
  try:
    ip, _ = await client_ip(scope)
    return ip, RateLimitGroup.default
  except EmptyInformation:
    return "random-ip", RateLimitGroup.default


_PRODUCTION_RULES: dict[str, Sequence[Rule]] = {
  "^/v1": [
    Rule(group=RateLimitGroup.restricted, minute=60, zone="api"),
    Rule(group=RateLimitGroup.default, minute=500, zone="api"),
    Rule(group=RateLimitGroup.web, second=100, zone="api"),
    Rule(group=RateLimitGroup.elevated, second=100, zone="api"),
  ],
}


def get_middleware(app: ASGIApp) -> RateLimitMiddleware:
  match settings.ENV:
    case Environment.production:
      rules = _PRODUCTION_RULES
    case _:
      rules = {}
  return RateLimitMiddleware(app, _authenticate, RedisBackend(create_redis("rate-limit")), rules)


__all__ = ["get_middleware"]
