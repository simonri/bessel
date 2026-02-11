from api.exceptions import MetronError
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


async def metron_error_handler(request: Request, exc: Exception) -> JSONResponse:
  if not isinstance(exc, MetronError):
    raise TypeError(f"Expected MetronError, got {type(exc).__name__}")

  return JSONResponse(
    status_code=exc.status_code,
    content={"error": type(exc).__name__, "detail": exc.message},
    headers=exc.headers,
  )


def add_exception_handlers(app: FastAPI) -> None:
  app.add_exception_handler(MetronError, metron_error_handler)
