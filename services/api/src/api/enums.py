from enum import StrEnum


class RateLimitGroup(StrEnum):
  web = "web"
  restricted = "restricted"
  default = "default"
  elevated = "elevated"
