from datetime import timedelta
from uuid import UUID

from sqlalchemy.exc import IntegrityError

from api.common.db.postgres import AsyncSession
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
    device = await repo.get_by_key(user_id, device_key)

    if device:
      if utc_now() - device.last_seen_at >= _STALE_AFTER:
        await repo.update(device, update_dict={"last_seen_at": utc_now()}, flush=True)
      return device

    device = Device(user_id=user_id, device_key=device_key, name=name, last_seen_at=utc_now())
    try:
      async with session.begin_nested():
        await repo.create(device, flush=True)
    except IntegrityError:
      # Lost a concurrent-creation race: the other request's row is committed by now.
      device = await repo.get_by_key(user_id, device_key)
      if device is None:
        raise
      return device

    return device


device_service = DeviceService()
