from collections.abc import Sequence

from ratelimit import RateLimitMiddleware, Rule
from ratelimit.auths import EmptyInformation
from ratelimit.auths.ip import client_ip
from ratelimit.backends.redis import RedisBackend
from ratelimit.types import ASGIApp, Scope

from api.enums import RateLimitGroup
from api.redis import Redis, create_redis
from api.settings import Environment, settings

_rate_limit_redis: Redis | None = None


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
  global _rate_limit_redis
  match settings.ENV:
    case Environment.production:
      rules = _PRODUCTION_RULES
    case _:
      rules = {}
  _rate_limit_redis = create_redis("rate-limit")
  return RateLimitMiddleware(app, _authenticate, RedisBackend(_rate_limit_redis), rules)


async def dispose_redis() -> None:
  global _rate_limit_redis
  if _rate_limit_redis is not None:
    await _rate_limit_redis.close(True)
    _rate_limit_redis = None


__all__ = ["dispose_redis", "get_middleware"]
