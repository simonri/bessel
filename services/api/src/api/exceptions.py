from collections.abc import Sequence
from typing import ClassVar, Literal

from pydantic import BaseModel, Field, create_model
from pydantic_core import ErrorDetails, InitErrorDetails, PydanticCustomError
from pydantic_core import ValidationError as PydanticValidationError


class BesselError(Exception):
  """Base exception for all application errors."""

  _schema: ClassVar[type[BaseModel] | None] = None

  def __init__(
    self,
    message: str,
    status_code: int = 500,
    headers: dict[str, str] | None = None,
  ) -> None:
    super().__init__(message)
    self.message = message
    self.status_code = status_code
    self.headers = headers

  @classmethod
  def schema(cls) -> type[BaseModel]:
    if cls._schema is not None:
      return cls._schema

    error_literal = Literal[cls.__name__]  # type: ignore

    model = create_model(
      cls.__name__,
      error=(error_literal, Field(examples=[cls.__name__])),
      detail=(str, ...),
    )
    cls._schema = model
    return cls._schema


class ResourceNotFound(BesselError):
  """Resource was not found."""

  def __init__(self, message: str = "Not found", status_code: int = 404) -> None:
    super().__init__(message, status_code)


class ValidationError(BesselError):
  """Request validation failed."""

  def __init__(self, message: str = "Validation failed", status_code: int = 400) -> None:
    super().__init__(message, status_code)


class ConflictError(BesselError):
  """Resource already exists or state conflict."""

  def __init__(self, message: str = "Conflict", status_code: int = 409) -> None:
    super().__init__(message, status_code)


class UnauthorizedError(BesselError):
  """Authentication required or token invalid."""

  def __init__(self, message: str = "Unauthorized", status_code: int = 401) -> None:
    super().__init__(message, status_code, headers={"WWW-Authenticate": "Bearer"})


class ForbiddenError(BesselError):
  """Access to this resource is forbidden."""

  def __init__(self, message: str = "Forbidden", status_code: int = 403) -> None:
    super().__init__(message, status_code)


class ServiceUnavailableError(BesselError):
  """External service is unavailable."""

  def __init__(self, message: str = "Service unavailable", status_code: int = 503) -> None:
    super().__init__(message, status_code)


class InternalError(BesselError):
  """Internal server error."""

  def __init__(self, message: str = "Internal server error", status_code: int = 500) -> None:
    super().__init__(message, status_code)


class BesselRequestValidationError(BesselError):
  def __init__(self, errors: Sequence[ErrorDetails]) -> None:
    super().__init__("Request validation failed", status_code=422)
    self._errors = errors

  def errors(self) -> list[ErrorDetails]:
    pydantic_errors: list[InitErrorDetails] = []
    for error in self._errors:
      pydantic_errors.append(
        {
          "type": PydanticCustomError(error["type"], error["msg"]),
          "loc": error["loc"],
          "input": error["input"],
        }
      )
    pydantic_error = PydanticValidationError.from_exception_data(self.__class__.__name__, pydantic_errors)
    return pydantic_error.errors()
