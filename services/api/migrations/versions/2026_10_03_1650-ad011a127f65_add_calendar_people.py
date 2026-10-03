"""add calendar people

Revision ID: ad011a127f65
Revises: 5e1a9c2d7f30
Create Date: 2026-10-03 16:50:57.542427

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'ad011a127f65'
down_revision: str | Sequence[str] | None = '5e1a9c2d7f30'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.create_table(
    'calendar_people',
    sa.Column('account_id', sa.Uuid(), nullable=False),
    sa.Column('email', sa.String(length=320), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=True),
    sa.Column('photo_url', sa.String(length=2048), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column('modified_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['account_id'], ['calendar_accounts.id'], name=op.f('calendar_people_account_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('calendar_people_pkey')),
    sa.UniqueConstraint('account_id', 'email', name='calendar_people_account_id_email_key'),
  )
  op.create_index(op.f('ix_calendar_people_account_id'), 'calendar_people', ['account_id'], unique=False)
  op.create_index(op.f('ix_calendar_people_created_at'), 'calendar_people', ['created_at'], unique=False)
  op.create_index(op.f('ix_calendar_people_deleted_at'), 'calendar_people', ['deleted_at'], unique=False)
  op.add_column('calendar_accounts', sa.Column('can_read_people', sa.Boolean(), server_default=sa.text('false'), nullable=False))
  op.add_column('calendar_accounts', sa.Column('people_synced_at', sa.TIMESTAMP(timezone=True), nullable=True))


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_column('calendar_accounts', 'people_synced_at')
  op.drop_column('calendar_accounts', 'can_read_people')
  op.drop_index(op.f('ix_calendar_people_deleted_at'), table_name='calendar_people')
  op.drop_index(op.f('ix_calendar_people_created_at'), table_name='calendar_people')
  op.drop_index(op.f('ix_calendar_people_account_id'), table_name='calendar_people')
  op.drop_table('calendar_people')
