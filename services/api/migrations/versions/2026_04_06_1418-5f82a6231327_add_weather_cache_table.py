"""add weather cache table

Revision ID: 5f82a6231327
Revises: 15f656f863dd
Create Date: 2026-04-06 14:18:21.783680

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '5f82a6231327'
down_revision: str | Sequence[str] | None = '15f656f863dd'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.create_table(
    'weather_cache',
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('lat', sa.Float(), nullable=False),
    sa.Column('lon', sa.Float(), nullable=False),
    sa.Column('temperature_max', sa.Float(), nullable=False),
    sa.Column('temperature_min', sa.Float(), nullable=False),
    sa.Column('weather_code', sa.Integer(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column('modified_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('weather_cache_pkey')),
    sa.UniqueConstraint('date', 'lat', 'lon', name=op.f('weather_cache_date_lat_lon_key')),
  )
  op.create_index(op.f('ix_weather_cache_created_at'), 'weather_cache', ['created_at'], unique=False)
  op.create_index(op.f('ix_weather_cache_date'), 'weather_cache', ['date'], unique=False)
  op.create_index(op.f('ix_weather_cache_deleted_at'), 'weather_cache', ['deleted_at'], unique=False)


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_index(op.f('ix_weather_cache_deleted_at'), table_name='weather_cache')
  op.drop_index(op.f('ix_weather_cache_date'), table_name='weather_cache')
  op.drop_index(op.f('ix_weather_cache_created_at'), table_name='weather_cache')
  op.drop_table('weather_cache')
