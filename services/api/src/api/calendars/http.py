import httpx

TIMEOUT_SECONDS = 30


def client() -> httpx.AsyncClient:
  """HTTP client for talking to calendar providers (swapped for fakes in tests)."""
  return httpx.AsyncClient(timeout=TIMEOUT_SECONDS)
