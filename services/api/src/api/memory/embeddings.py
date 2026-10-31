"""Search by meaning: a small model on this server turns facts and queries into vectors.

The model runs in-process, so nothing about the user leaves the server. It loads
on first use; until then, or if it can't load, memory search falls back to words.
"""

import hashlib
import threading
from collections.abc import Sequence
from functools import cache
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

import anyio
import structlog

from api.settings import settings

if TYPE_CHECKING:
  from fastembed import TextEmbedding

log = structlog.get_logger()

# Enough to embed a few hundred facts in under a minute without taking the server's other work.
THREADS = 4


class Embedder(Protocol):
  model: str

  async def documents(self, texts: Sequence[str]) -> list[list[float]]: ...

  async def query(self, text: str) -> list[float]: ...


def embedding_key(model: str, document: str) -> str:
  """Changes whenever the model or the embedded text does, so a stored vector is known to be stale."""
  return hashlib.sha256(f"{model}\n{document}".encode()).hexdigest()


class LocalEmbedder:
  def __init__(self, model: str, cache_dir: Path | None) -> None:
    self.model = model
    self._cache_dir = cache_dir
    self._loaded: TextEmbedding | None = None
    self._lock = threading.Lock()

  def _load(self) -> "TextEmbedding":
    with self._lock:
      if self._loaded is None:
        from fastembed import TextEmbedding

        log.info("Loading memory embedding model", model=self.model)
        self._loaded = TextEmbedding(self.model, cache_dir=str(self._cache_dir) if self._cache_dir else None, threads=THREADS)
      return self._loaded

  def _embed(self, texts: Sequence[str]) -> list[list[float]]:
    return [vector.tolist() for vector in self._load().embed(list(texts))]

  async def documents(self, texts: Sequence[str]) -> list[list[float]]:
    return await anyio.to_thread.run_sync(self._embed, texts)

  async def query(self, text: str) -> list[float]:
    [vector] = await anyio.to_thread.run_sync(self._embed, [text])
    return vector


@cache
def _local() -> LocalEmbedder:
  return LocalEmbedder(settings.MEMORY_EMBEDDING_MODEL, settings.MEMORY_EMBEDDING_CACHE_DIR)


def get_embedder() -> Embedder | None:
  return _local() if settings.MEMORY_EMBEDDING_MODEL else None
