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
from sentry_sdk.scrubber import DEFAULT_DENYLIST, EventScrubber

from api.logging import logging
from api.settings import Environment, settings

# Field names Sentry's default list misses: the third-party logins people connect.
CREDENTIAL_FIELDS = [
  "totp_secret",
  "app_password",
  "client_secret",
  "access_token",
  "refresh_token",
  "id_token",
  "code",
  "code_verifier",
  "state",
  "encrypted_credentials",
]


def event_scrubber() -> EventScrubber:
  return EventScrubber(denylist=[*DEFAULT_DENYLIST, *CREDENTIAL_FIELDS], recursive=True)


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
    # Bodies and stack variables carry the bank, broker and iCloud logins people connect.
    max_request_body_size="never",
    include_local_variables=False,
    event_scrubber=event_scrubber(),
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
