"""add user timezone

Revision ID: 3f8a2c71d9e4
Revises: d59cd5ef17b2
Create Date: 2026-10-08 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '3f8a2c71d9e4'
down_revision: str | Sequence[str] | None = 'd59cd5ef17b2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.add_column('users', sa.Column('timezone', sa.String(length=64), nullable=True))


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_column('users', 'timezone')
