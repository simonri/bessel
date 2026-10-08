from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from mcp.types import ToolAnnotations


@dataclass(frozen=True)
class ToolSpec:
  fn: Callable[..., Any]
  title: str
  annotations: ToolAnnotations


def read(fn: Callable[..., Any], title: str) -> ToolSpec:
  return ToolSpec(fn, title, ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False))


def write(fn: Callable[..., Any], title: str, *, idempotent: bool = False) -> ToolSpec:
  """A tool that changes the user's data. None of them delete anything."""
  return ToolSpec(fn, title, ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=idempotent, open_world_hint=False))
