from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from api.exceptions import BesselError, BesselRequestValidationError


async def bessel_error_handler(request: Request, exc: Exception) -> JSONResponse:
  if not isinstance(exc, BesselError):
    raise TypeError(f"Expected BesselError, got {type(exc).__name__}")

  content: dict = {"error": type(exc).__name__, "detail": exc.message}
  if isinstance(exc, BesselRequestValidationError):
    content["errors"] = jsonable_encoder(exc.errors())

  return JSONResponse(
    status_code=exc.status_code,
    content=content,
    headers=exc.headers,
  )


def add_exception_handlers(app: FastAPI) -> None:
  app.add_exception_handler(BesselError, bessel_error_handler)
