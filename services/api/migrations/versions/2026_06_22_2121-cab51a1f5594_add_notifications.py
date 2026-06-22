"""add notifications

Revision ID: cab51a1f5594
Revises: e49ad6188599
Create Date: 2026-06-22 21:21:24.948908

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'cab51a1f5594'
down_revision: str | Sequence[str] | None = 'e49ad6188599'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.create_table(
    'notifications',
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('body', sa.Text(), nullable=True),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('read_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column('modified_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('notifications_pkey')),
  )
  op.create_index(op.f('ix_notifications_created_at'), 'notifications', ['created_at'], unique=False)
  op.create_index(op.f('ix_notifications_deleted_at'), 'notifications', ['deleted_at'], unique=False)


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_index(op.f('ix_notifications_deleted_at'), table_name='notifications')
  op.drop_index(op.f('ix_notifications_created_at'), table_name='notifications')
  op.drop_table('notifications')
