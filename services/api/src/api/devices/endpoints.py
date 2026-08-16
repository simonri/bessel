from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from api.devices.repository import DeviceRepository
from api.devices.schemas import DeviceSchema, DeviceUpdate
from api.postgres import AsyncSession, get_db_session
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/devices", tags=["devices"])


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
  repo = DeviceRepository.from_session(session)
  device = await repo.get_owned_or_404(device_id, current_user.id, check_not_deleted=True, not_found_message="Device not found")
  await repo.update(device, update_dict=body.model_dump(exclude_unset=True))
  return DeviceSchema.model_validate(device)


@router.delete("/{device_id}", summary="Delete Device", status_code=204)
async def delete_device(
  device_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> None:
  repo = DeviceRepository.from_session(session)
  device = await repo.get_owned_or_404(device_id, current_user.id, check_not_deleted=True, not_found_message="Device not found")
  await repo.delete(device)
