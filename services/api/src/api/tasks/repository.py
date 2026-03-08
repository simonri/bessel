from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.task import Task


class TaskRepository(RepositoryBase[Task], RepositoryIDMixin[Task, UUID]):
  model = Task
