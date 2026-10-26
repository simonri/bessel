from typing import Any

import pytest
from api import sentry
from api.settings import Environment, settings


def filtered(value: Any) -> bool:
  return getattr(value, "value", value) == "[Filtered]"


class TestEventScrubber:
  def test_filters_connected_logins_at_any_depth(self) -> None:
    event: dict[str, Any] = {
      "request": {
        "data": {
          "username": "123456",
          "password": "hunter2",
          "totp_secret": "JBSWY3DPEHPK3PXP",
          "account": {"app_password": "abcd-efgh-ijkl-mnop"},
        },
      },
      "extra": {"payload": {"client_secret": "s3cret", "refresh_token": "r1"}},
    }

    sentry.event_scrubber().scrub_event(event)

    data = event["request"]["data"]
    assert data["username"] == "123456"
    assert filtered(data["password"])
    assert filtered(data["totp_secret"])
    assert filtered(data["account"]["app_password"])
    payload = event["extra"]["payload"]
    assert filtered(payload["client_secret"])
    assert filtered(payload["refresh_token"])


class TestConfigureSentry:
  def test_never_sends_request_bodies_or_stack_variables(self, monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.setattr(settings, "ENV", Environment.production)
    monkeypatch.setattr(settings, "SENTRY_DSN", "https://key@sentry.example/1")
    monkeypatch.setattr(sentry.sentry_sdk, "init", lambda **kwargs: captured.update(kwargs))

    sentry.configure_sentry()

    assert captured["max_request_body_size"] == "never"
    assert captured["include_local_variables"] is False
    assert isinstance(captured["event_scrubber"], sentry.EventScrubber)
