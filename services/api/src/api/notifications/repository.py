from uuid import UUID

from sqlalchemy import select, update

from api.common.repository.base import RepositoryBase
from api.common.utils import utc_now
from api.models.notification import Notification


class NotificationRepository(RepositoryBase[Notification]):
  model = Notification

  async def list_recent(self, user_id: UUID, limit: int = 50) -> list[Notification]:
    result = await self.session.execute(
      select(Notification).where(Notification.deleted_at.is_(None)).where(Notification.user_id == user_id).order_by(Notification.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())

  async def mark_read(self, notification_id: UUID, user_id: UUID) -> Notification | None:
    result = await self.session.execute(
      select(Notification).where(Notification.id == notification_id).where(Notification.user_id == user_id).where(Notification.deleted_at.is_(None))
    )
    notification = result.scalar_one_or_none()
    if notification and notification.read_at is None:
      notification.read_at = utc_now()
    return notification

  async def mark_all_read(self, user_id: UUID) -> int:
    result = await self.session.execute(
      update(Notification)
      .where(Notification.deleted_at.is_(None))
      .where(Notification.user_id == user_id)
      .where(Notification.read_at.is_(None))
      .values(read_at=utc_now())
      .returning(Notification.id)
    )
    return len(result.fetchall())
