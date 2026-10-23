from pydantic import Field, computed_field

from api.common.schemas import IDSchema, TimestampedSchema
from api.documents.previews import MAX_PREVIEW_PAGES


class DocumentSchema(IDSchema, TimestampedSchema):
  filename: str = Field(description="The name the file was uploaded with.")
  content_type: str = Field(description="application/pdf or an image type.")
  size_bytes: int
  page_count: int = Field(description="The document's pages; a photo has one.")

  @computed_field(description="How many of the pages have a preview image, from the first.")  # type: ignore[prop-decorator]
  @property
  def preview_pages(self) -> int:
    return min(self.page_count, MAX_PREVIEW_PAGES)
