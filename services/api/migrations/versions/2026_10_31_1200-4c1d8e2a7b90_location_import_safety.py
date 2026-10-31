"""location import safety

Revision ID: 4c1d8e2a7b90
Revises: 119bb42952e7
Create Date: 2026-10-31 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '4c1d8e2a7b90'
down_revision: str | Sequence[str] | None = '119bb42952e7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.add_column('location_segments', sa.Column('end_utc_offset_minutes', sa.Integer(), nullable=True))
  op.add_column('location_imports', sa.Column('unreadable', sa.Integer(), server_default='0', nullable=False))
  op.add_column('location_imports', sa.Column('archive_key', sa.String(length=255), nullable=True))


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_column('location_imports', 'archive_key')
  op.drop_column('location_imports', 'unreadable')
  op.drop_column('location_segments', 'end_utc_offset_minutes')
