import httpx

TIMEOUT_SECONDS = 30


def client() -> httpx.AsyncClient:
  """HTTP client for talking to Enable Banking (swapped for a fake in tests)."""
  return httpx.AsyncClient(timeout=TIMEOUT_SECONDS)
