"""drop the open-meteo weather cache

Revision ID: 22306becac48
Revises: d3dc1cc1062f
Create Date: 2026-10-24 20:01:40.980434

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '22306becac48'
down_revision: str | Sequence[str] | None = 'd3dc1cc1062f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  # Forecasts now come from Yr and are kept in Redis for as long as Yr says they're current.
  op.drop_table('weather_cache')


def downgrade() -> None:
  """Downgrade schema."""
  op.create_table(
    'weather_cache',
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('lat', sa.Float(), nullable=False),
    sa.Column('lon', sa.Float(), nullable=False),
    sa.Column('temperature_max', sa.Float(), nullable=False),
    sa.Column('temperature_min', sa.Float(), nullable=False),
    sa.Column('apparent_temperature_max', sa.Float(), nullable=False),
    sa.Column('precipitation_probability_max', sa.Integer(), nullable=False),
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
