from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class User(RecordModel):
  __tablename__ = "users"

  auth0_sub: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
  email: Mapped[str | None] = mapped_column(String(255), nullable=True)
