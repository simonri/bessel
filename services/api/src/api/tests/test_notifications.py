import pytest
from api.common.utils import utc_now
from api.models.notification import Notification
from api.models.user import User
from api.postgres import AsyncSession
from httpx import AsyncClient


class TestUnreadCount:
  @pytest.mark.asyncio
  async def test_counts_every_unread_notification_not_just_the_listed_ones(self, client: AsyncClient, session: AsyncSession, user: User) -> None:
    session.add_all(Notification(user_id=user.id, title=f"Alert {i}", kind="info", read_at=utc_now() if i == 0 else None) for i in range(60))
    await session.flush()

    listing = (await client.get("/v1/notifications")).json()

    assert len(listing["notifications"]) == 50
    assert listing["unread_count"] == 59
