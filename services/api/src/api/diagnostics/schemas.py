import json
from typing import Any

from pydantic import Field, field_validator

from api.common.schemas import Schema

MAX_PAYLOADS = 10
MAX_PAYLOAD_BYTES = 64 * 1024


class ClientDiagnosticsUpload(Schema):
  platform: str = Field(max_length=16, description="Client platform, e.g. ios.")
  version: str = Field(max_length=32, description="App version.")
  build: str = Field(max_length=32, description="App build number.")
  payloads: list[dict[str, Any]] = Field(
    max_length=MAX_PAYLOADS,
    description="Crash, hang and other diagnostic reports as the OS produced them (MetricKit on iOS).",
  )

  @field_validator("payloads")
  @classmethod
  def limit_payload_size(cls, payloads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for payload in payloads:
      if len(json.dumps(payload)) > MAX_PAYLOAD_BYTES:
        raise ValueError(f"Each payload must be at most {MAX_PAYLOAD_BYTES} bytes.")
    return payloads
