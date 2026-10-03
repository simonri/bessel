"""add calendar change tracking and invitation responses

Revision ID: 7f5cda19cf6b
Revises: 13858e318146
Create Date: 2026-10-03 14:51:47.845517

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '7f5cda19cf6b'
down_revision: str | Sequence[str] | None = '13858e318146'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.add_column('calendars', sa.Column('change_tag', sa.String(length=255), nullable=True))
  op.add_column('calendars', sa.Column('push_channel_id', sa.String(length=64), nullable=True))
  op.add_column('calendars', sa.Column('push_resource_id', sa.String(length=255), nullable=True))
  op.add_column('calendars', sa.Column('push_token', sa.String(length=64), nullable=True))
  op.add_column('calendars', sa.Column('push_renew_at', sa.DateTime(timezone=True), nullable=True))
  op.create_unique_constraint(op.f('calendars_push_channel_id_key'), 'calendars', ['push_channel_id'])
  op.add_column('calendar_events', sa.Column('my_response', sa.String(length=16), nullable=True))


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_column('calendar_events', 'my_response')
  op.drop_constraint(op.f('calendars_push_channel_id_key'), 'calendars', type_='unique')
  op.drop_column('calendars', 'push_renew_at')
  op.drop_column('calendars', 'push_token')
  op.drop_column('calendars', 'push_resource_id')
  op.drop_column('calendars', 'push_channel_id')
  op.drop_column('calendars', 'change_tag')
