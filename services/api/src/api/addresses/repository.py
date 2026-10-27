import re
from collections.abc import Iterable
from uuid import UUID

from sqlalchemy.dialects.postgresql import insert as pg_insert

from api.common.repository.base import RepositoryBase
from api.common.utils import utc_now
from api.models.address_location import AddressLocation


def address_key(address: str) -> str:
  """The same address however it's spaced or capitalised."""
  return re.sub(r"\s+", " ", address).strip().casefold()


class AddressLocationRepository(RepositoryBase[AddressLocation]):
  model = AddressLocation

  async def save(self, user_id: UUID, address: str, latitude: float, longitude: float) -> None:
    key = address_key(address)
    statement = (
      pg_insert(AddressLocation)
      .values(user_id=user_id, address=key, latitude=latitude, longitude=longitude)
      .on_conflict_do_update(
        constraint="address_locations_user_id_address_key",
        set_={"latitude": latitude, "longitude": longitude, "modified_at": utc_now(), "deleted_at": None},
      )
    )
    await self.session.execute(statement)

  async def for_addresses(self, user_id: UUID, addresses: Iterable[str]) -> dict[str, tuple[float, float]]:
    """Coordinates by address_key for the addresses that have them."""
    keys = {address_key(a) for a in addresses}
    if not keys:
      return {}
    statement = self.get_base_statement().where(AddressLocation.user_id == user_id, AddressLocation.address.in_(keys), AddressLocation.deleted_at.is_(None))
    return {location.address: (location.latitude, location.longitude) for location in await self.get_all(statement)}
