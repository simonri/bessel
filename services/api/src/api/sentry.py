import sentry_sdk
from sentry_sdk.integrations.argv import ArgvIntegration
from sentry_sdk.integrations.atexit import AtexitIntegration
from sentry_sdk.integrations.dedupe import DedupeIntegration
from sentry_sdk.integrations.excepthook import ExcepthookIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.integrations.modules import ModulesIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.integrations.threading import ThreadingIntegration

from api.logging import logging
from api.settings import Environment, settings


def configure_sentry() -> None:
  if settings.ENV != Environment.production:
    return

  if not settings.SENTRY_DSN:
    return

  sentry_sdk.init(
    dsn=settings.SENTRY_DSN,
    traces_sample_rate=None,
    profiles_sample_rate=None,
    release="bessel",
    server_name="bessel",
    environment=settings.ENV,
    default_integrations=False,
    auto_enabling_integrations=False,
    integrations=[
      AtexitIntegration(),
      ExcepthookIntegration(),
      DedupeIntegration(),
      ModulesIntegration(),
      ArgvIntegration(),
      LoggingIntegration(
        level=logging.INFO,
        event_level=None,
      ),
      ThreadingIntegration(),
      StarletteIntegration(transaction_style="endpoint"),
      FastApiIntegration(transaction_style="endpoint"),
    ],
  )
