from collections.abc import Awaitable, Callable

from api.common.db.postgres import AsyncSession
from sqlalchemy.exc import IntegrityError


async def get_or_create[T](
  session: AsyncSession,
  *,
  fetch: Callable[[], Awaitable[T | None]],
  build: Callable[[], T],
  create: Callable[[T], Awaitable[T]],
  on_found: Callable[[T], Awaitable[T]] | None = None,
) -> tuple[T, bool]:
  """Race-safe get-or-create against a natural key.

  Looks up the entity via `fetch`. If found, runs `on_found` (e.g. to patch
  it) and returns it. Otherwise builds a new entity via `build` and creates
  it inside a nested transaction via `create`. If a concurrent request wins
  the creation race, the resulting `IntegrityError` is caught, the entity is
  re-fetched via `fetch`, and returned. Re-raises if it's still missing.

  Returns a `(entity, created)` tuple, where `created` is `True` only when
  this call created the row.
  """
  existing = await fetch()
  if existing is not None:
    if on_found is not None:
      existing = await on_found(existing)
    return existing, False

  entity = build()
  try:
    async with session.begin_nested():
      entity = await create(entity)
  except IntegrityError:
    existing = await fetch()
    if existing is None:
      raise
    return existing, False

  return entity, True
