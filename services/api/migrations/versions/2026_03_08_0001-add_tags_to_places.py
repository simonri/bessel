"""add tags column to places

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-03-08 00:01:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

# revision identifiers, used by Alembic.
revision: str = "j0k1l2m3n4o5"
down_revision: str | Sequence[str] | None = "i9j0k1l2m3n4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.add_column("places", sa.Column("tags", ARRAY(sa.String(50)), nullable=True))


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_column("places", "tags")
