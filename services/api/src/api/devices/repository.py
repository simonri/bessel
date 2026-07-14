from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.device import Device


class DeviceRepository(RepositoryBase[Device], RepositoryIDMixin[Device, UUID]):
  model = Device

  async def get_by_key(self, user_id: UUID, device_key: str) -> Device | None:
    statement = select(Device).where(Device.user_id == user_id).where(Device.device_key == device_key)
    return await self.get_one_or_none(statement)

  async def list_for_user(self, user_id: UUID) -> Sequence[Device]:
    statement = select(Device).where(Device.user_id == user_id).order_by(Device.last_seen_at.desc())
    return await self.get_all(statement)
