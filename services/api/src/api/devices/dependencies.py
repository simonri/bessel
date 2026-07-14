from typing import Annotated

from fastapi import Depends, Header

from api.devices.service import device_service
from api.exceptions import ValidationError
from api.models.device import Device
from api.postgres import AsyncSession, get_db_session
from api.users.dependencies import CurrentDBUser


async def get_optional_current_device(
  current_user: CurrentDBUser,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  # Optional (rather than a required Header()) so the OpenAPI spec — and the
  # generated TS client's request options — don't force every caller of e.g.
  # GET /projects to pass headers explicitly. The Electron client's request
  # interceptor sets this on every call; browser-only sessions (no local
  # filesystem, so no device to resolve a path for) simply get None here.
  x_device_id: Annotated[str | None, Header()] = None,
  x_device_name: Annotated[str | None, Header()] = None,
) -> Device | None:
  if not x_device_id:
    return None
  return await device_service.get_or_create_by_key(
    session,
    current_user.id,
    x_device_id,
    x_device_name or "Unnamed device",
  )


async def get_current_device(
  device: Annotated[Device | None, Depends(get_optional_current_device)],
) -> Device:
  if device is None:
    raise ValidationError(message="X-Device-Id header is required", status_code=400)
  return device


# Use where a device is genuinely required (e.g. setting a project's location
# for "this device" is meaningless without knowing which device that is).
CurrentDevice = Annotated[Device, Depends(get_current_device)]
# Use where device context only refines the response if present (e.g. listing
# projects, which browser-only callers can still do without one).
OptionalCurrentDevice = Annotated[Device | None, Depends(get_optional_current_device)]
