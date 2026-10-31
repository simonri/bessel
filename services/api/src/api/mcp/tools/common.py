from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from mcp.types import ToolAnnotations


@dataclass(frozen=True)
class ToolSpec:
  fn: Callable[..., Any]
  title: str
  annotations: ToolAnnotations


def read(fn: Callable[..., Any], title: str, *, open_world: bool = False) -> ToolSpec:
  """`open_world` for a tool whose results come from outside the user's own data (mail from others, a weather service),
  which clients treat as untrusted input."""
  return ToolSpec(fn, title, ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=open_world))


def write(fn: Callable[..., Any], title: str, *, idempotent: bool = False, overwrites: bool = False) -> ToolSpec:
  """A tool that changes the user's data. None of them delete anything, but one that `overwrites` changes what is
  already there rather than only adding to it, which the protocol counts as destructive."""
  return ToolSpec(fn, title, ToolAnnotations(read_only_hint=False, destructive_hint=overwrites, idempotent_hint=idempotent, open_world_hint=False))
