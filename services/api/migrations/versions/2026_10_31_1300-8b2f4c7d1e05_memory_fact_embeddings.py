"""memory fact embeddings

Revision ID: 8b2f4c7d1e05
Revises: 3c1d8e5a9f20
Create Date: 2026-10-31 13:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '8b2f4c7d1e05'
down_revision: str | Sequence[str] | None = '3c1d8e5a9f20'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.add_column('memory_facts', sa.Column('embedding', postgresql.ARRAY(sa.REAL()), nullable=True))
  op.add_column('memory_facts', sa.Column('embedding_key', sa.String(length=64), nullable=True))


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_column('memory_facts', 'embedding_key')
  op.drop_column('memory_facts', 'embedding')
