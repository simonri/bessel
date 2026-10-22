from pydantic import Field

from api.common.schemas import IDSchema, TimestampedSchema


class DocumentSchema(IDSchema, TimestampedSchema):
  filename: str = Field(description="The name the file was uploaded with.")
  content_type: str = Field(description="application/pdf or an image type.")
  size_bytes: int
  page_count: int = Field(description="Pages with a preview image; a photo has one.")
