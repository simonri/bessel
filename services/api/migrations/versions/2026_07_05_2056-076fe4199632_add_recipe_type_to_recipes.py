"""add_recipe_type_to_recipes

Revision ID: 076fe4199632
Revises: 9f2ce41d78aa
Create Date: 2026-07-05 20:56:08.421068

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '076fe4199632'
down_revision: str | Sequence[str] | None = '9f2ce41d78aa'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.add_column('recipes', sa.Column('recipe_type', sa.String(length=20), nullable=False, server_default='other'))


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_column('recipes', 'recipe_type')
