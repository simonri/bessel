from fastapi import UploadFile

from api.exceptions import ValidationError

_CHUNK_SIZE = 64 * 1024

# Leading bytes of each accepted image type. The client's declared content
# type is never trusted: SVG/HTML labelled image/* would otherwise be stored
# and served back as active content.
_IMAGE_SIGNATURES: list[tuple[str, bytes, int]] = [
  ("image/png", b"\x89PNG\r\n\x1a\n", 0),
  ("image/jpeg", b"\xff\xd8\xff", 0),
  ("image/gif", b"GIF87a", 0),
  ("image/gif", b"GIF89a", 0),
]
_ISO_BMFF_BRANDS = {
  b"heic": "image/heic",
  b"heix": "image/heic",
  b"mif1": "image/heif",
  b"msf1": "image/heif",
  b"avif": "image/avif",
}


async def read_upload(file: UploadFile, max_bytes: int, too_large_message: str) -> bytes:
  """Read an upload in chunks, rejecting it as soon as it exceeds max_bytes."""
  chunks: list[bytes] = []
  total = 0
  while chunk := await file.read(_CHUNK_SIZE):
    total += len(chunk)
    if total > max_bytes:
      raise ValidationError(too_large_message, status_code=413)
    chunks.append(chunk)
  return b"".join(chunks)


def detect_image_type(content: bytes) -> str | None:
  if content[:4] == b"RIFF":
    return "image/webp" if content[8:12] == b"WEBP" else None
  for content_type, signature, offset in _IMAGE_SIGNATURES:
    if content[offset : offset + len(signature)] == signature:
      return content_type
  if content[4:8] == b"ftyp":
    return _ISO_BMFF_BRANDS.get(content[8:12])
  return None
