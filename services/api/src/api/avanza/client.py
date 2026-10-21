"""A small async client for the parts of Avanza's private web API Bessel reads.

Avanza has no public API; these are the routes its web app uses, as mapped by
the community avanza-api library (16.2), which can change without notice.
Only read routes are called. Login is username, password and a TOTP code.
"""

import asyncio
import time
from datetime import date
from typing import Any

import httpx
import pyotp

BASE_URL = "https://www.avanza.se"
LOGIN_PATH = "/_api/authentication/sessions/usercredentials"
TOTP_PATH = "/_api/authentication/sessions/totp"
OVERVIEW_PATH = "/_api/account-overview/overview/categorizedAccounts"
POSITIONS_PATH = "/_api/position-data/positions"
TRANSACTIONS_PATH = "/_api/transactions/list"
TIMEOUT_SECONDS = 30
TOTP_STEP_SECONDS = 30
# The shortest session Avanza allows; Bessel only needs a few minutes.
SESSION_MINUTES = 30


async def wait_for_next_code() -> None:
  await asyncio.sleep(TOTP_STEP_SECONDS - time.time() % TOTP_STEP_SECONDS + 1)


class AvanzaError(Exception):
  """Avanza answered with an error or something unexpected; try again later."""


class AvanzaAuthError(AvanzaError):
  """Avanza rejected the username, password or TOTP secret; new ones are needed."""


def http_client() -> httpx.AsyncClient:
  """HTTP client for Avanza (swapped for a fake in tests)."""
  return httpx.AsyncClient(base_url=BASE_URL, timeout=TIMEOUT_SECONDS, headers={"User-Agent": "Bessel (personal dashboard)"})


class AvanzaClient:
  def __init__(self, http: httpx.AsyncClient) -> None:
    self._http = http
    self._token: str | None = None

  async def login(self, username: str, password: str, totp_secret: str) -> None:
    response = await self._http.post(LOGIN_PATH, json={"maxInactiveMinutes": SESSION_MINUTES, "username": username, "password": password})
    if response.status_code == 401:
      raise AvanzaAuthError("Avanza didn't accept the username or password.")
    _check(response)
    body = response.json()
    if body.get("twoFactorLogin") is None:
      self._token = response.headers.get("X-SecurityToken")
      return
    if body["twoFactorLogin"].get("method") != "TOTP":
      raise AvanzaAuthError("Avanza asks for a second factor other than an authenticator app.")
    try:
      totp = pyotp.TOTP(totp_secret)
      code = totp.now()
    except (TypeError, ValueError) as e:
      raise AvanzaAuthError("The TOTP secret isn't valid.") from e

    response = await self._http.post(TOTP_PATH, json={"method": "TOTP", "totpCode": code})
    if response.status_code == 401:
      # A code is single-use: one used moments ago (another login) fails, so try the next one.
      await wait_for_next_code()
      response = await self._http.post(TOTP_PATH, json={"method": "TOTP", "totpCode": totp.now()})
      if response.status_code == 401:
        raise AvanzaAuthError("Avanza didn't accept the code from the TOTP secret.")
    _check(response)
    self._token = response.headers.get("X-SecurityToken")

  async def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    if self._token is None:
      raise AvanzaError("Not logged in.")
    response = await self._http.get(path, params=params, headers={"X-SecurityToken": self._token})
    if response.status_code == 401:
      raise AvanzaAuthError("Avanza ended the session.")
    _check(response)
    return response.json()

  async def overview(self) -> dict[str, Any]:
    return await self._get(OVERVIEW_PATH)

  async def positions(self) -> dict[str, Any]:
    return await self._get(POSITIONS_PATH)

  async def transactions(self, *, date_from: date, date_to: date, max_elements: int) -> dict[str, Any]:
    params = {"from": date_from.isoformat(), "to": date_to.isoformat(), "maxElements": max_elements}
    return await self._get(TRANSACTIONS_PATH, params)


def _check(response: httpx.Response) -> None:
  # Only the status: Avanza's error bodies and the request can carry account details.
  if not response.is_success:
    raise AvanzaError(f"Avanza answered {response.status_code} for {response.request.url.path}.")
