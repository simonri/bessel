"""places unique per user

Revision ID: 9d4b2e7a1c58
Revises: 7e3a9c1f5b24
Create Date: 2026-11-01 16:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '9d4b2e7a1c58'
down_revision: str | Sequence[str] | None = '7e3a9c1f5b24'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

WHERE = sa.text('google_place_id IS NOT NULL AND deleted_at IS NULL')


def upgrade() -> None:
  """Upgrade schema."""
  op.drop_constraint('places_google_place_id_key', 'places', type_='unique')
  op.create_index('places_user_google_place_id_key', 'places', ['user_id', 'google_place_id'], unique=True, postgresql_where=WHERE)


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_index('places_user_google_place_id_key', table_name='places', postgresql_where=WHERE)
  op.create_unique_constraint('places_google_place_id_key', 'places', ['google_place_id'])
