"""add status, visited_at, country to places; remove visited bool

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-03-07 00:03:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "i9j0k1l2m3n4"
down_revision: str | Sequence[str] | None = "h8i9j0k1l2m3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  # Add new columns
  op.add_column("places", sa.Column("status", sa.String(20), nullable=True))
  op.add_column("places", sa.Column("visited_at", sa.Date(), nullable=True))
  op.add_column("places", sa.Column("country", sa.String(100), nullable=True))

  # Migrate data: visited=true -> status='visited', visited=false -> status='want_to_go'
  op.execute(sa.text("UPDATE places SET status = CASE WHEN visited THEN 'visited' ELSE 'want_to_go' END"))

  # Now make status NOT NULL with default
  op.alter_column("places", "status", nullable=False, server_default="want_to_go")

  # Drop old visited column
  op.drop_column("places", "visited")


def downgrade() -> None:
  """Downgrade schema."""
  op.add_column("places", sa.Column("visited", sa.Boolean(), nullable=True, server_default="false"))
  op.execute(sa.text("UPDATE places SET visited = (status = 'visited')"))
  op.alter_column("places", "visited", nullable=False)

  op.drop_column("places", "country")
  op.drop_column("places", "visited_at")
  op.drop_column("places", "status")
