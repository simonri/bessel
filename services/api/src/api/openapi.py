from typing import Any, TypedDict

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from api.settings import Environment, settings


class OpenAPIParameters(TypedDict):
  title: str
  summary: str
  version: str
  description: str
  docs_url: str | None
  redoc_url: str | None
  servers: list[dict[str, Any]] | None


OPENAPI_PARAMETERS: OpenAPIParameters = {
  "title": "Bessel API",
  "summary": "Bessel HTTP and Webhooks API",
  "version": "0.1.0",
  "description": "Hello! This is the Bessel API.",
  "docs_url": None if settings.is_environment({Environment.production}) else "/docs",
  "redoc_url": None if settings.is_environment({Environment.production}) else "/redoc",
  "servers": [
    {
      "url": "https://api.getbessel.com",
      "description": "Production environment",
      "x-speakeasy-server-id": "production",
    },
  ],
}


def set_openapi_generator(app: FastAPI) -> None:
  def _openapi_generator() -> dict[str, Any]:
    if app.openapi_schema:
      return app.openapi_schema

    openapi_schema = get_openapi(
      title=app.title,
      version=app.version,
      openapi_version=app.openapi_version,
      summary=app.summary,
      description=app.description,
      terms_of_service=app.terms_of_service,
      contact=app.contact,
      license_info=app.license_info,
      routes=app.routes,
      webhooks=app.webhooks.routes,
      tags=app.openapi_tags,
      servers=app.servers,
      separate_input_output_schemas=app.separate_input_output_schemas,
    )

    app.openapi_schema = openapi_schema
    return openapi_schema

  app.openapi = _openapi_generator  # type: ignore[method-assign]


__all__ = [
  "OPENAPI_PARAMETERS",
  "set_openapi_generator",
]
