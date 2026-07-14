from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from api.devices.repository import DeviceRepository
from api.devices.schemas import DeviceSchema, DeviceUpdate
from api.exceptions import ResourceNotFound
from api.models.device import Device
from api.postgres import AsyncSession, get_db_session
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/devices", tags=["devices"])


async def _get_device_or_404(session: AsyncSession, device_id: UUID, user_id: UUID) -> Device:
  repo = DeviceRepository.from_session(session)
  device = await repo.get_by_id(device_id)
  if not device or device.user_id != user_id:
    raise ResourceNotFound(message="Device not found")
  return device


@router.get("", summary="List Devices", response_model=list[DeviceSchema])
async def list_devices(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> list[DeviceSchema]:
  repo = DeviceRepository.from_session(session)
  devices = await repo.list_for_user(current_user.id)
  return [DeviceSchema.model_validate(d) for d in devices]


@router.patch("/{device_id}", summary="Rename Device", response_model=DeviceSchema)
async def update_device(
  device_id: UUID,
  body: DeviceUpdate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> DeviceSchema:
  device = await _get_device_or_404(session, device_id, current_user.id)
  repo = DeviceRepository.from_session(session)
  await repo.update(device, update_dict=body.model_dump(exclude_unset=True))
  return DeviceSchema.model_validate(device)


@router.delete("/{device_id}", summary="Delete Device", status_code=204)
async def delete_device(
  device_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> None:
  device = await _get_device_or_404(session, device_id, current_user.id)
  await DeviceRepository.from_session(session).delete(device)
