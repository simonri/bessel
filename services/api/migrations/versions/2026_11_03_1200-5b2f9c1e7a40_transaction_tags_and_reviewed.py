"""transaction tags and reviewed

Revision ID: 5b2f9c1e7a40
Revises: d395c69b4461
Create Date: 2026-11-03 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '5b2f9c1e7a40'
down_revision: str | Sequence[str] | None = 'd395c69b4461'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.add_column('transactions', sa.Column('tags', postgresql.ARRAY(sa.String(length=50)), server_default=sa.text("'{}'"), nullable=False))
  op.create_index('ix_transactions_tags', 'transactions', ['tags'], unique=False, postgresql_using='gin')
  # What is there already counts as reviewed; only later imports arrive unreviewed.
  op.add_column('transactions', sa.Column('reviewed', sa.Boolean(), server_default=sa.true(), nullable=False))
  op.alter_column('transactions', 'reviewed', server_default=sa.false())


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_column('transactions', 'reviewed')
  op.drop_index('ix_transactions_tags', table_name='transactions', postgresql_using='gin')
  op.drop_column('transactions', 'tags')
