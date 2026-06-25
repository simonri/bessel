from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class Project(RecordModel):
  __tablename__ = "projects"

  name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
