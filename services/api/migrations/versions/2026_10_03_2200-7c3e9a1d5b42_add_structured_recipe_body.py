"""add structured recipe body

Revision ID: 7c3e9a1d5b42
Revises: b97324d94eb7
Create Date: 2026-10-03 22:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "7c3e9a1d5b42"
down_revision: str | Sequence[str] | None = "b97324d94eb7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  # Existing recipes keep body NULL and are read from their markdown until
  # they're next saved.
  op.add_column("recipes", sa.Column("body", postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
  op.drop_column("recipes", "body")
