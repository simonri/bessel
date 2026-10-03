import ipaddress
from collections.abc import Sequence

from ratelimit import RateLimitMiddleware, Rule
from ratelimit.backends.redis import RedisBackend
from ratelimit.types import ASGIApp, Scope

from api.enums import RateLimitGroup
from api.redis import Redis, create_redis
from api.settings import Environment, settings

_rate_limit_redis: Redis | None = None


def _header(scope: Scope, name: bytes) -> str | None:
  for key, value in scope.get("headers", []):
    if key == name:
      return value.decode("latin-1").strip()
  return None


def _is_public(ip: str) -> bool:
  try:
    return ipaddress.ip_address(ip).is_global
  except ValueError:
    return False


def client_ip(scope: Scope) -> str | None:
  """The real client IP behind Cloudflare → Traefik.

  Traefik sets X-Real-IP to its direct peer. For traffic through the
  Cloudflare tunnel that peer is the private cloudflared container, so the
  client is in CF-Connecting-IP. Anything else reached Traefik directly, and
  X-Real-IP is already the client — CF-Connecting-IP from such a request is
  attacker-controlled and ignored.
  """
  real_ip = _header(scope, b"x-real-ip")
  if real_ip and _is_public(real_ip):
    return real_ip
  cf_ip = _header(scope, b"cf-connecting-ip")
  if cf_ip and _is_public(cf_ip):
    return cf_ip
  client = scope.get("client")
  return client[0] if client else None


async def _authenticate(scope: Scope) -> tuple[str, RateLimitGroup]:
  return client_ip(scope) or "unknown", RateLimitGroup.default


# First matching pattern wins, so costly endpoints come before the catch-all.
_PRODUCTION_RULES: dict[str, Sequence[Rule]] = {
  # Each search spends quota on the paid Google Places key.
  r"^/v1/places/search": [Rule(group=RateLimitGroup.default, minute=30, zone="places-search")],
  r"^/v1/tasks/[^/]+/attachments$": [
    Rule(group=RateLimitGroup.default, method="post", minute=30, zone="uploads"),
    Rule(group=RateLimitGroup.default, minute=500, zone="api"),
  ],
  r"^/v1/transactions/import": [Rule(group=RateLimitGroup.default, minute=10, zone="imports")],
  r"^/v1/klarna": [Rule(group=RateLimitGroup.default, minute=10, zone="imports")],
  # Each import is a paid LLM call.
  r"^/v1/recipes/import$": [Rule(group=RateLimitGroup.default, minute=5, hour=30, zone="recipe-import")],
  r"^/v1/ingest-tokens": [Rule(group=RateLimitGroup.default, minute=10, zone="ingest-tokens")],
  r"^/v1/calendars/(google/authorize|icloud|accounts/[^/]+/sync)": [Rule(group=RateLimitGroup.default, minute=10, zone="calendar-connect")],
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
