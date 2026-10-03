"""Minimal OpenRouter client for structured (JSON schema) completions."""

import json
from typing import Any

import httpx
import structlog

from api.exceptions import BesselError, ServiceUnavailableError
from api.settings import settings

log = structlog.get_logger()

API_URL = "https://openrouter.ai/api/v1/chat/completions"
TIMEOUT_SECONDS = 60


class LLMUnavailableError(BesselError):
  """The language model provider failed or is not configured."""

  def __init__(self, message: str = "The AI service is unavailable right now.", status_code: int = 502) -> None:
    super().__init__(message, status_code)


class LLMOutputError(Exception):
  """The model answered, but not with JSON matching the requested shape."""


def client() -> httpx.AsyncClient:
  """HTTP client for OpenRouter (swapped for fakes in tests)."""
  return httpx.AsyncClient(timeout=TIMEOUT_SECONDS)


async def complete_json(
  *,
  model: str,
  system: str,
  user: str,
  schema_name: str,
  schema: dict[str, Any],
  max_tokens: int,
) -> dict[str, Any]:
  """Run one chat completion constrained to `schema` and return the parsed object."""
  if not settings.OPENROUTER_API_KEY:
    raise ServiceUnavailableError("AI features aren't configured on this server.")

  payload = {
    "model": model,
    "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    "response_format": {"type": "json_schema", "json_schema": {"name": schema_name, "strict": True, "schema": schema}},
    # Only route to providers that actually enforce the schema.
    "provider": {"require_parameters": True},
    "temperature": 0,
    "max_tokens": max_tokens,
  }
  headers = {
    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
    "HTTP-Referer": settings.FRONTEND_BASE_URL,
    "X-Title": "Bessel",
  }
  try:
    async with client() as http:
      response = await http.post(API_URL, json=payload, headers=headers)
  except httpx.HTTPError as e:
    log.warning("openrouter.request_failed", model=model, error=str(e))
    raise LLMUnavailableError() from e

  if response.status_code != 200:
    log.warning("openrouter.bad_status", model=model, status=response.status_code, body=response.text[:500])
    raise LLMUnavailableError()

  try:
    choice = response.json()["choices"][0]
    content = choice["message"]["content"]
  except (ValueError, KeyError, IndexError, TypeError) as e:
    raise LLMOutputError("Malformed completion response") from e
  if choice.get("finish_reason") == "length":
    raise LLMOutputError("Completion was cut off")
  try:
    parsed = json.loads(content)
  except (TypeError, ValueError) as e:
    raise LLMOutputError("Completion was not JSON") from e
  if not isinstance(parsed, dict):
    raise LLMOutputError("Completion was not a JSON object")
  return parsed
