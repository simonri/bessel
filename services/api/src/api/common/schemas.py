import dataclasses
from collections.abc import Sequence
from datetime import datetime
from typing import Any, Literal, cast, get_args, overload

from pydantic import UUID4, BaseModel, ConfigDict, Field, GetCoreSchemaHandler, GetJsonSchemaHandler
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import core_schema


class Schema(BaseModel):
  model_config = ConfigDict(from_attributes=True)


class IDSchema(Schema):
  id: UUID4 = Field(..., description="The ID of the object.")

  model_config = ConfigDict(
    # IMPORTANT: this ensures FastAPI doesn't generate `-Input` for output schemas
    json_schema_mode_override="serialization",
  )


class TimestampedSchema(Schema):
  created_at: datetime = Field(description="Creation timestamp of the object.")
  modified_at: datetime | None = Field(description="Last modification timestamp of the object.")


@dataclasses.dataclass(slots=True)
class MergeJSONSchema:
  json_schema: JsonSchemaValue
  mode: Literal["validation", "serialization"] | None = None

  def __get_pydantic_json_schema__(self, core_schema: core_schema.CoreSchema, handler: GetJsonSchemaHandler) -> JsonSchemaValue:
    mode = self.mode or handler.mode
    json_schema = handler(core_schema)
    if mode != handler.mode:
      return json_schema
    return {**json_schema, **self.json_schema}

  def __hash__(self) -> int:
    return hash(type(self.mode))


@dataclasses.dataclass(slots=True)
class ClassName:
  """
  Used as an annotation metadata, it allows us to customize the name generated
  by Pydantic for a type; in particular, a long union.

  It does **nothing** on its own, but it can be used by other classes.

  Currently, it's used by `ListResource` to generate a shorter name for the
  OpenAPI schema, when we list a resource having a long union type.
  """

  name: str

  def __hash__(self) -> int:
    return hash(type(self.name))


class MultipleQueryFilter[Q](Sequence[Q]):
  """
  Custom type to handle query filters that can be either
  a single value or a list of values.

  By customizing the schema generation, we can make it accept
  either a scalar or a list of values for the query parameter.

  At runtime, we make sure that the value is always a list.
  """

  def __init__(self, v: Sequence[Q]):
    self.v = v

  @overload
  def __getitem__(self, s: int) -> Q: ...

  @overload
  def __getitem__(self, s: slice) -> Sequence[Q]: ...

  def __getitem__(self, s: int | slice) -> Q | Sequence[Q]:
    return self.v[s]

  def __len__(self) -> int:
    return len(self.v)

  @classmethod
  def __get_pydantic_core_schema__(cls, source: Any, handler: GetCoreSchemaHandler) -> core_schema.CoreSchema:
    args = get_args(source)
    if len(args) == 0:
      raise TypeError("QueryFilter requires at least one type argument")

    generic_type = args[0]
    sequence_schema = handler.generate_schema(Sequence[generic_type])  # type: ignore
    scalar_schema = handler.generate_schema(generic_type)
    union_schema = core_schema.union_schema([scalar_schema, sequence_schema])

    return core_schema.no_info_after_validator_function(cls._scalar_to_sequence, handler(union_schema))

  @classmethod
  def _scalar_to_sequence(cls, v: Q | Sequence[Q]) -> Sequence[Q]:
    if isinstance(v, Sequence) and not isinstance(v, str):
      return v
    return [cast(Q, v)]  # type: ignore[redundant-cast]
