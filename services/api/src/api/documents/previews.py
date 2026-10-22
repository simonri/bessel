"""Images of a document's pages, made once on upload.

The app shows these instead of the original, so a PDF's scripts never run in the browser and a photo's location
data never leaves the server.
"""

import io
from dataclasses import dataclass

import anyio
import pypdfium2
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

from api.exceptions import ValidationError

register_heif_opener()

MAX_PREVIEW_PAGES = 20
PAGE_WIDTH = 1400
THUMBNAIL_WIDTH = 320
WEBP_QUALITY = 80
# A decompression bomb would otherwise take the server's memory with it.
Image.MAX_IMAGE_PIXELS = 60_000_000


@dataclass(frozen=True, slots=True)
class Previews:
  pages: list[bytes]
  thumbnail: bytes


def _webp(image: Image.Image, width: int) -> bytes:
  image = image.convert("RGB")
  if image.width > width:
    image = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
  out = io.BytesIO()
  # Saved fresh, so nothing of the original's metadata comes along.
  image.save(out, format="WEBP", quality=WEBP_QUALITY)
  return out.getvalue()


def _pdf_pages(content: bytes) -> list[Image.Image]:
  try:
    pdf = pypdfium2.PdfDocument(content)
  except pypdfium2.PdfiumError as error:
    message = "This PDF is password-protected." if "password" in str(error).lower() else "This PDF couldn't be read."
    raise ValidationError(message) from error
  try:
    pages = []
    for index in range(min(len(pdf), MAX_PREVIEW_PAGES)):
      page = pdf[index]
      scale = PAGE_WIDTH / max(page.get_width(), 1)
      pages.append(page.render(scale=scale).to_pil())
    if not pages:
      raise ValidationError("This PDF has no pages.")
    return pages
  finally:
    pdf.close()


def _photo(content: bytes) -> list[Image.Image]:
  try:
    with Image.open(io.BytesIO(content)) as image:
      # Phones store which way is up separately; apply it before the metadata is dropped.
      return [ImageOps.exif_transpose(image).copy()]
  except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
    raise ValidationError("This image couldn't be read.") from error


def _render(content: bytes, content_type: str) -> Previews:
  pages = _pdf_pages(content) if content_type == "application/pdf" else _photo(content)
  return Previews(pages=[_webp(page, PAGE_WIDTH) for page in pages], thumbnail=_webp(pages[0], THUMBNAIL_WIDTH))


async def render_previews(content: bytes, content_type: str) -> Previews:
  return await anyio.to_thread.run_sync(_render, content, content_type)
