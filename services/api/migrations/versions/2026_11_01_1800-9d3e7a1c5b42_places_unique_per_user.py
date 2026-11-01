"""places unique per user

Revision ID: 9d3e7a1c5b42
Revises: 4c1d8e2a7b90
Create Date: 2026-11-01 18:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '9d3e7a1c5b42'
down_revision: str | Sequence[str] | None = '4c1d8e2a7b90'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.drop_constraint(op.f('places_google_place_id_key'), 'places', type_='unique')
  op.create_unique_constraint(op.f('places_user_id_google_place_id_key'), 'places', ['user_id', 'google_place_id'])


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_constraint(op.f('places_user_id_google_place_id_key'), 'places', type_='unique')
  op.create_unique_constraint(op.f('places_google_place_id_key'), 'places', ['google_place_id'])
