"""drop avanza credentials

Revision ID: 14ea16c22815
Revises: 997ee0e41d4f
Create Date: 2026-10-26 20:29:58.324439

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '14ea16c22815'
down_revision: str | Sequence[str] | None = '997ee0e41d4f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.drop_column('avanza_connections', 'encrypted_credentials')


def downgrade() -> None:
  """Downgrade schema."""
  op.add_column('avanza_connections', sa.Column('encrypted_credentials', sa.Text(), nullable=True))
