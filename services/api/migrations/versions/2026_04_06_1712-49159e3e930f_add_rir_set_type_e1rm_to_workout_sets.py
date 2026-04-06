"""add rir set_type e1rm to workout sets

Revision ID: 49159e3e930f
Revises: 06268fcd3991
Create Date: 2026-04-06 17:12:18.710629

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '49159e3e930f'
down_revision: str | Sequence[str] | None = '06268fcd3991'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.add_column('workout_sets', sa.Column('rir', sa.Integer(), nullable=True))
  op.add_column('workout_sets', sa.Column('set_type', sa.String(length=10), nullable=True))
  op.add_column('workout_sets', sa.Column('e1rm', sa.Float(), nullable=True))


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_column('workout_sets', 'e1rm')
  op.drop_column('workout_sets', 'set_type')
  op.drop_column('workout_sets', 'rir')
