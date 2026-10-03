"""add calendar event color

Revision ID: b317c542f715
Revises: ad011a127f65
Create Date: 2026-10-03 17:03:39.114874

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b317c542f715'
down_revision: str | Sequence[str] | None = 'ad011a127f65'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.add_column('calendar_events', sa.Column('color_id', sa.String(length=2), nullable=True))


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_column('calendar_events', 'color_id')
