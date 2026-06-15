from api.common.repository.base import RepositoryBase
from api.models.activity_event import ActivityEvent


class ActivityRepository(RepositoryBase[ActivityEvent]):
    model = ActivityEvent
