"""calendar owned

Revision ID: 7e3a9c1f5b24
Revises: 4c1d8e2a7b90
Create Date: 2026-11-01 15:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '7e3a9c1f5b24'
down_revision: str | Sequence[str] | None = '4c1d8e2a7b90'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  # Existing rows count as owned until the next sync (within minutes) says which were shared.
  op.add_column('calendars', sa.Column('owned', sa.Boolean(), server_default=sa.text('true'), nullable=False))


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_column('calendars', 'owned')
