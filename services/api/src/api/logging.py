import hashlib
import logging.config
from typing import Any
from urllib.parse import urlparse

import structlog

from api.settings import settings

Logger = structlog.stdlib.BoundLogger


def mask_email(email: str | None) -> str:
  """Mask email for logging - returns first char + hash suffix.

  Example: "user@example.com" -> "u...a1b2c3"
  """
  if not email:
    return "<none>"
  hash_suffix = hashlib.sha256(email.encode()).hexdigest()[:6]
  return f"{email[0]}...{hash_suffix}"


def mask_url(url: str | None) -> str:
  """Mask URL for logging - returns scheme + domain only.

  Example: "https://hooks.discord.com/abc123/secret" -> "https://hooks.discord.com/..."
  """
  if not url:
    return "<none>"
  try:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}/..."
  except Exception:
    return "<invalid-url>"


def mask_key(key: str | None, visible_chars: int = 4) -> str:
  """Mask sensitive keys/tokens - shows first N chars + asterisks.

  Example: "sk_live_abc123xyz" -> "sk_l****"
  """
  if not key:
    return "<none>"
  if len(key) <= visible_chars:
    return "****"
  return f"{key[:visible_chars]}****"


class Logging[RendererType]:
  timestamper = structlog.processors.TimeStamper(fmt="iso")

  @classmethod
  def get_level(cls) -> str:
    return settings.LOG_LEVEL

  @classmethod
  def get_processors(cls) -> list[Any]:
    return [
      structlog.contextvars.merge_contextvars,
      structlog.stdlib.add_log_level,
      structlog.stdlib.add_logger_name,
      structlog.stdlib.PositionalArgumentsFormatter(),
      cls.timestamper,
      structlog.processors.UnicodeDecoder(),
      structlog.processors.StackInfoRenderer(),
      structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
    ]

  @classmethod
  def get_renderer(cls) -> RendererType:
    raise NotImplementedError()

  @classmethod
  def configure_stdlib(cls) -> None:
    level = cls.get_level()
    logging.config.dictConfig(
      {
        "version": 1,
        "disable_existing_loggers": True,
        "formatters": {
          "bessel": {
            "()": structlog.stdlib.ProcessorFormatter,
            "processors": [
              structlog.stdlib.ProcessorFormatter.remove_processors_meta,
              cls.get_renderer(),
            ],
            "foreign_pre_chain": [
              structlog.contextvars.merge_contextvars,
              structlog.stdlib.add_log_level,
              structlog.stdlib.add_logger_name,
              structlog.stdlib.PositionalArgumentsFormatter(),
              structlog.stdlib.ExtraAdder(),
              cls.timestamper,
              structlog.processors.UnicodeDecoder(),
              structlog.processors.StackInfoRenderer(),
            ],
          },
        },
        "handlers": {
          "default": {
            "level": level,
            "class": "logging.StreamHandler",
            "formatter": "bessel",
          },
        },
        "loggers": {
          "": {
            "handlers": ["default"],
            "level": level,
            "propagate": False,
          },
          # Propagate third-party loggers to the root one
          **{  # type: ignore[var-annotated]
            logger: {
              "handlers": [],
              "propagate": True,
            }
            for logger in ["uvicorn", "sqlalchemy", "dramatiq", "apscheduler"]
          },
        },
      }
    )

  @classmethod
  def configure_structlog(cls) -> None:
    structlog.configure_once(
      processors=cls.get_processors(),
      logger_factory=structlog.stdlib.LoggerFactory(),
      wrapper_class=structlog.stdlib.BoundLogger,
      cache_logger_on_first_use=True,
    )

  @classmethod
  def configure(cls) -> None:
    cls.configure_structlog()
    cls.configure_stdlib()


class Development(Logging[structlog.dev.ConsoleRenderer]):
  @classmethod
  def get_renderer(cls) -> structlog.dev.ConsoleRenderer:
    return structlog.dev.ConsoleRenderer(colors=True)


class Production(Logging[structlog.processors.JSONRenderer]):
  @classmethod
  def get_renderer(cls) -> structlog.processors.JSONRenderer:
    return structlog.processors.JSONRenderer()


def configure() -> None:
  if settings.is_testing():
    Development.configure()
  elif settings.is_development():
    Development.configure()
  else:
    Production.configure()
