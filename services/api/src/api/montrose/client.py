"""Montrose's MCP service: OAuth with BankID consent, then tools called over JSON-RPC.

Montrose publishes no API of its own; the MCP service is the supported way to read an account.
Endpoints come from https://mcp.montrose.io/.well-known/oauth-authorization-server.
"""

import base64
import hashlib
import json
import secrets
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx

BASE_URL = "https://mcp.montrose.io"
RESOURCE = BASE_URL
SCOPE = "mcp"
PROTOCOL_VERSION = "2025-06-18"
TIMEOUT = httpx.Timeout(30.0)


class MontroseError(Exception):
  """Montrose answered in a way Bessel can't use."""


class MontroseAuthError(MontroseError):
  """Montrose no longer accepts the consent; the user has to log in with BankID again."""


@dataclass(frozen=True, slots=True)
class RegisteredClient:
  client_id: str
  client_secret: str


@dataclass(frozen=True, slots=True)
class Tokens:
  access_token: str
  refresh_token: str
  expires_in: int


@dataclass(frozen=True, slots=True)
class Pkce:
  verifier: str
  challenge: str


def http_client() -> httpx.AsyncClient:
  return httpx.AsyncClient(base_url=BASE_URL, timeout=TIMEOUT, headers={"User-Agent": "Bessel (+https://getbessel.com)"})


def new_pkce() -> Pkce:
  verifier = secrets.token_urlsafe(48)
  challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
  return Pkce(verifier=verifier, challenge=challenge)


async def register_client(http: httpx.AsyncClient, *, redirect_uri: str) -> RegisteredClient:
  response = await http.post(
    "/register",
    json={
      "client_name": "Bessel",
      "redirect_uris": [redirect_uri],
      "grant_types": ["authorization_code", "refresh_token"],
      "response_types": ["code"],
      "token_endpoint_auth_method": "client_secret_post",
      "scope": SCOPE,
    },
  )
  if response.status_code >= 300:
    raise MontroseError(f"Client registration failed ({response.status_code}).")
  body = response.json()
  return RegisteredClient(client_id=body["client_id"], client_secret=body["client_secret"])


def authorize_url(client: RegisteredClient, *, redirect_uri: str, state: str, code_challenge: str) -> str:
  query = {
    "response_type": "code",
    "client_id": client.client_id,
    "redirect_uri": redirect_uri,
    "scope": SCOPE,
    "state": state,
    "code_challenge": code_challenge,
    "code_challenge_method": "S256",
    "resource": RESOURCE,
  }
  return f"{BASE_URL}/authorize?{urlencode(query)}"


async def _token(http: httpx.AsyncClient, client: RegisteredClient, grant: dict[str, str]) -> Tokens:
  response = await http.post(
    "/token",
    data={**grant, "client_id": client.client_id, "client_secret": client.client_secret, "resource": RESOURCE},
  )
  body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
  if response.status_code in (400, 401) and body.get("error") in ("invalid_grant", "invalid_client", "unauthorized_client"):
    raise MontroseAuthError(body["error"])
  if response.status_code >= 300 or "access_token" not in body:
    raise MontroseError(f"Token request failed ({response.status_code}).")
  return Tokens(access_token=body["access_token"], refresh_token=body["refresh_token"], expires_in=int(body.get("expires_in", 900)))


async def exchange_code(http: httpx.AsyncClient, client: RegisteredClient, *, code: str, code_verifier: str, redirect_uri: str) -> Tokens:
  return await _token(http, client, {"grant_type": "authorization_code", "code": code, "code_verifier": code_verifier, "redirect_uri": redirect_uri})


async def refresh(http: httpx.AsyncClient, client: RegisteredClient, *, refresh_token: str) -> Tokens:
  return await _token(http, client, {"grant_type": "refresh_token", "refresh_token": refresh_token})


def _json_rpc_result(response: httpx.Response) -> dict[str, Any]:
  """The JSON-RPC reply, sent either as plain JSON or as one server-sent event."""
  if response.headers.get("content-type", "").startswith("text/event-stream"):
    events = [line[len("data:") :].strip() for line in response.text.splitlines() if line.startswith("data:")]
    message = json.loads(events[-1]) if events else {}
  else:
    message = response.json()
  if "error" in message:
    raise MontroseError(f"Montrose returned an error ({message['error'].get('code')}).")
  return message.get("result", {})


class McpSession:
  """One conversation with the MCP service: initialize, then call tools with the bearer token."""

  def __init__(self, http: httpx.AsyncClient, access_token: str) -> None:
    self.http = http
    self.headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
    self.next_id = 0

  async def _post(self, payload: dict[str, Any]) -> httpx.Response:
    response = await self.http.post("/", json=payload, headers=self.headers)
    if response.status_code == 401:
      raise MontroseAuthError("unauthorized")
    if response.status_code >= 300:
      raise MontroseError(f"MCP request failed ({response.status_code}).")
    return response

  async def _request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
    self.next_id += 1
    return _json_rpc_result(await self._post({"jsonrpc": "2.0", "id": self.next_id, "method": method, "params": params}))

  async def initialize(self) -> None:
    self.next_id += 1
    response = await self._post(
      {
        "jsonrpc": "2.0",
        "id": self.next_id,
        "method": "initialize",
        "params": {"protocolVersion": PROTOCOL_VERSION, "capabilities": {}, "clientInfo": {"name": "Bessel", "version": "1"}},
      }
    )
    _json_rpc_result(response)
    if session_id := response.headers.get("mcp-session-id"):
      self.headers["Mcp-Session-Id"] = session_id
    await self._post({"jsonrpc": "2.0", "method": "notifications/initialized"})

  async def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> Any:
    """The tool's data: its structured content when given, otherwise its text parsed as JSON."""
    result = await self._request("tools/call", {"name": name, "arguments": arguments or {}})
    if result.get("isError"):
      raise MontroseError(f"Tool {name} failed.")
    if "structuredContent" in result:
      structured = result["structuredContent"]
      return structured.get("result", structured) if isinstance(structured, dict) else structured
    text = "".join(part.get("text", "") for part in result.get("content", []) if part.get("type") == "text")
    try:
      return json.loads(text)
    except json.JSONDecodeError as e:
      raise MontroseError(f"Tool {name} returned text that isn't JSON.") from e
