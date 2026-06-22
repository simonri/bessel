from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.counter import Counter, CounterReset


class CounterRepository(RepositoryBase[Counter], RepositoryIDMixin[Counter, UUID]):
  model = Counter


class CounterResetRepository(RepositoryBase[CounterReset], RepositoryIDMixin[CounterReset, UUID]):
  model = CounterReset
