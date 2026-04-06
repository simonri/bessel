"""add weather forecast fields

Revision ID: c4f80725fd68
Revises: 5f82a6231327
Create Date: 2026-04-06 16:20:06.814137

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c4f80725fd68'
down_revision: str | Sequence[str] | None = '5f82a6231327'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.execute("DELETE FROM weather_cache")
  op.add_column('weather_cache', sa.Column('apparent_temperature_max', sa.Float(), nullable=False))
  op.add_column('weather_cache', sa.Column('precipitation_probability_max', sa.Integer(), nullable=False))


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_column('weather_cache', 'precipitation_probability_max')
  op.drop_column('weather_cache', 'apparent_temperature_max')
