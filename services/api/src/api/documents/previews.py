"""Images of a document's pages, made once on upload.

The app shows these instead of the original, so a PDF's scripts never run in the browser, and the previews carry
none of a photo's metadata, such as where it was taken. The original is kept as uploaded, for its owner to download.
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
# A page rendered at PAGE_WIDTH is held to this many pixels and this long a side, so an absurdly tall page can't take
# the server's memory, and its preview stays within what WebP can store (16,383 pixels a side).
MAX_PAGE_PIXELS = 6_000_000
MAX_PAGE_SIDE = 8_000
THUMBNAIL_WIDTH = 320
WEBP_QUALITY = 80
# A decompression bomb would otherwise take the server's memory with it.
Image.MAX_IMAGE_PIXELS = 60_000_000


@dataclass(frozen=True, slots=True)
class Previews:
  pages: list[bytes]
  thumbnail: bytes
  # All of the document's pages, of which `pages` previews the first MAX_PREVIEW_PAGES.
  page_count: int


def _webp(image: Image.Image, width: int) -> bytes:
  image = image.convert("RGB")
  if image.width > width:
    image = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
  out = io.BytesIO()
  # Saved fresh, so nothing of the original's metadata comes along.
  image.save(out, format="WEBP", quality=WEBP_QUALITY)
  return out.getvalue()


def _scale(width: float, height: float) -> float:
  """PAGE_WIDTH across, unless that would make the page bigger than MAX_PAGE_PIXELS or longer than MAX_PAGE_SIDE."""
  width, height = max(width, 1), max(height, 1)
  return min(PAGE_WIDTH / width, (MAX_PAGE_PIXELS / (width * height)) ** 0.5, MAX_PAGE_SIDE / height)


def _pdf(content: bytes) -> Previews:
  try:
    pdf = pypdfium2.PdfDocument(content)
  except pypdfium2.PdfiumError as error:
    message = "This PDF is password-protected." if "password" in str(error).lower() else "This PDF couldn't be read."
    raise ValidationError(message) from error
  try:
    if len(pdf) == 0:
      raise ValidationError("This PDF has no pages.")
    pages, thumbnail = [], b""
    # One page in memory at a time: each is made into its preview before the next is drawn.
    for index in range(min(len(pdf), MAX_PREVIEW_PAGES)):
      page = pdf[index]
      image = page.render(scale=_scale(page.get_width(), page.get_height())).to_pil()
      pages.append(_webp(image, PAGE_WIDTH))
      if index == 0:
        thumbnail = _webp(image, THUMBNAIL_WIDTH)
    return Previews(pages=pages, thumbnail=thumbnail, page_count=len(pdf))
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
  if content_type == "application/pdf":
    return _pdf(content)
  [photo] = _photo(content)
  return Previews(pages=[_webp(photo, PAGE_WIDTH)], thumbnail=_webp(photo, THUMBNAIL_WIDTH), page_count=1)


async def render_previews(content: bytes, content_type: str) -> Previews:
  return await anyio.to_thread.run_sync(_render, content, content_type)
