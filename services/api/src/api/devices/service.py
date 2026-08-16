from datetime import timedelta
from uuid import UUID

from api.common.db.postgres import AsyncSession
from api.common.repository.get_or_create import get_or_create
from api.common.utils import utc_now
from api.devices.repository import DeviceRepository
from api.models.device import Device

_STALE_AFTER = timedelta(hours=1)


class DeviceService:
  async def get_or_create_by_key(
    self,
    session: AsyncSession,
    user_id: UUID,
    device_key: str,
    name: str,
  ) -> Device:
    repo = DeviceRepository.from_session(session)

    async def on_found(device: Device) -> Device:
      if utc_now() - device.last_seen_at >= _STALE_AFTER:
        await repo.update(device, update_dict={"last_seen_at": utc_now()}, flush=True)
      return device

    device, _ = await get_or_create(
      session,
      fetch=lambda: repo.get_by_key(user_id, device_key),
      on_found=on_found,
      build=lambda: Device(user_id=user_id, device_key=device_key, name=name, last_seen_at=utc_now()),
      create=lambda new_device: repo.create(new_device, flush=True),
    )

    return device


device_service = DeviceService()
