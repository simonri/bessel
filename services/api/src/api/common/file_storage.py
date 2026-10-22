"""Where uploaded files live: an S3-compatible bucket (Cloudflare R2) in production, a local folder elsewhere.

A container's own disk is lost on every deploy, so production refuses to store files until the bucket is set up.
"""

from functools import cache
from pathlib import Path
from typing import Protocol

import anyio
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from api.exceptions import ServiceUnavailableError
from api.settings import Environment, settings


class StorageNotConfiguredError(ServiceUnavailableError):
  def __init__(self) -> None:
    super().__init__("File storage isn't set up yet, so files can't be saved.")


class FileStorage(Protocol):
  async def put(self, key: str, content: bytes, content_type: str) -> None: ...

  async def get(self, key: str) -> bytes | None: ...

  async def delete(self, key: str) -> None: ...


class LocalFileStorage:
  def __init__(self, root: Path) -> None:
    self.root = root

  def _path(self, key: str) -> Path:
    path = (self.root / key).resolve()
    if not path.is_relative_to(self.root.resolve()):
      raise ValueError(f"Key leaves the storage folder: {key}")
    return path

  async def put(self, key: str, content: bytes, content_type: str) -> None:
    path = self._path(key)

    def write() -> None:
      path.parent.mkdir(parents=True, exist_ok=True)
      path.write_bytes(content)

    await anyio.to_thread.run_sync(write)

  async def get(self, key: str) -> bytes | None:
    path = self._path(key)
    return await anyio.to_thread.run_sync(lambda: path.read_bytes() if path.exists() else None)

  async def delete(self, key: str) -> None:
    path = self._path(key)
    await anyio.to_thread.run_sync(lambda: path.unlink(missing_ok=True))


class S3FileStorage:
  def __init__(self, *, endpoint_url: str, bucket: str, access_key_id: str, secret_access_key: str) -> None:
    self.bucket = bucket
    self.client = boto3.client(
      "s3",
      endpoint_url=endpoint_url,
      aws_access_key_id=access_key_id,
      aws_secret_access_key=secret_access_key,
      # R2 has one region, "auto"; checksums R2 doesn't support would fail every put.
      region_name="auto",
      config=Config(retries={"max_attempts": 3, "mode": "standard"}, request_checksum_calculation="when_required"),
    )

  async def put(self, key: str, content: bytes, content_type: str) -> None:
    await anyio.to_thread.run_sync(lambda: self.client.put_object(Bucket=self.bucket, Key=key, Body=content, ContentType=content_type))

  async def get(self, key: str) -> bytes | None:
    def read() -> bytes | None:
      try:
        return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
      except ClientError as error:
        if error.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
          return None
        raise

    return await anyio.to_thread.run_sync(read)

  async def delete(self, key: str) -> None:
    await anyio.to_thread.run_sync(lambda: self.client.delete_object(Bucket=self.bucket, Key=key))


@cache
def _bucket() -> S3FileStorage:
  return S3FileStorage(
    endpoint_url=settings.STORAGE_ENDPOINT_URL,
    bucket=settings.STORAGE_BUCKET,
    access_key_id=settings.STORAGE_ACCESS_KEY_ID,
    secret_access_key=settings.STORAGE_SECRET_ACCESS_KEY,
  )


def file_storage() -> FileStorage:
  if settings.storage_configured():
    return _bucket()
  if settings.ENV == Environment.production:
    raise StorageNotConfiguredError()
  return LocalFileStorage(Path(settings.FILES_DIR))
