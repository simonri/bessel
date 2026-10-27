from uuid import UUID

from sqlalchemy import Float, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class AddressLocation(RecordModel):
  """Where an address is, kept when it was picked from Google's suggestions.
  Address books have no field for coordinates, so they stay in Bessel, keyed
  by the address as the address book stores it (see addresses.address_key)."""

  __tablename__ = "address_locations"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
  address: Mapped[str] = mapped_column(String(1000), nullable=False)
  latitude: Mapped[float] = mapped_column(Float, nullable=False)
  longitude: Mapped[float] = mapped_column(Float, nullable=False)

  __table_args__ = (UniqueConstraint("user_id", "address", name="address_locations_user_id_address_key"),)
