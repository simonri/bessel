from api.exceptions import BesselError
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


async def bessel_error_handler(request: Request, exc: Exception) -> JSONResponse:
  if not isinstance(exc, BesselError):
    raise TypeError(f"Expected BesselError, got {type(exc).__name__}")

  return JSONResponse(
    status_code=exc.status_code,
    content={"error": type(exc).__name__, "detail": exc.message},
    headers=exc.headers,
  )


def add_exception_handlers(app: FastAPI) -> None:
  app.add_exception_handler(BesselError, bessel_error_handler)
