"""add location history

Revision ID: b97324d94eb7
Revises: b317c542f715
Create Date: 2026-10-03 19:14:27.377272

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b97324d94eb7'
down_revision: str | Sequence[str] | None = 'b317c542f715'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.create_table(
    'location_imports',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('filename', sa.String(length=255), nullable=True),
    sa.Column('format', sa.String(length=16), nullable=False),
    sa.Column('as_of', sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column('range_start', sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column('range_end', sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column('segments', sa.Integer(), nullable=False),
    sa.Column('added', sa.Integer(), nullable=False),
    sa.Column('updated', sa.Integer(), nullable=False),
    sa.Column('removed', sa.Integer(), nullable=False),
    sa.Column('unchanged', sa.Integer(), nullable=False),
    sa.Column('stale', sa.Integer(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column('modified_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('location_imports_user_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('location_imports_pkey')),
  )
  op.create_index(op.f('ix_location_imports_created_at'), 'location_imports', ['created_at'], unique=False)
  op.create_index(op.f('ix_location_imports_deleted_at'), 'location_imports', ['deleted_at'], unique=False)
  op.create_index(op.f('ix_location_imports_user_id'), 'location_imports', ['user_id'], unique=False)
  op.create_table(
    'location_segments',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('segment_key', sa.String(length=64), nullable=False),
    sa.Column('content_hash', sa.String(length=64), nullable=False),
    sa.Column('observed_at', sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('start_at', sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column('end_at', sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column('utc_offset_minutes', sa.Integer(), nullable=True),
    sa.Column('local_start', sa.TIMESTAMP(), nullable=False),
    sa.Column('local_end', sa.TIMESTAMP(), nullable=False),
    sa.Column('place_id', sa.String(length=255), nullable=True),
    sa.Column('semantic_type', sa.String(length=64), nullable=True),
    sa.Column('hierarchy_level', sa.SmallInteger(), nullable=True),
    sa.Column('latitude', sa.Float(), nullable=True),
    sa.Column('longitude', sa.Float(), nullable=True),
    sa.Column('activity_type', sa.String(length=64), nullable=True),
    sa.Column('distance_meters', sa.Float(), nullable=True),
    sa.Column('start_latitude', sa.Float(), nullable=True),
    sa.Column('start_longitude', sa.Float(), nullable=True),
    sa.Column('end_latitude', sa.Float(), nullable=True),
    sa.Column('end_longitude', sa.Float(), nullable=True),
    sa.Column('points', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column('modified_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('location_segments_user_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('location_segments_pkey')),
    sa.UniqueConstraint('user_id', 'segment_key', name='location_segments_user_id_segment_key_key'),
  )
  op.create_index(op.f('ix_location_segments_created_at'), 'location_segments', ['created_at'], unique=False)
  op.create_index(op.f('ix_location_segments_deleted_at'), 'location_segments', ['deleted_at'], unique=False)
  op.create_index(op.f('ix_location_segments_user_id'), 'location_segments', ['user_id'], unique=False)
  op.create_index('ix_location_segments_user_id_local_start', 'location_segments', ['user_id', 'local_start'], unique=False)


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_index('ix_location_segments_user_id_local_start', table_name='location_segments')
  op.drop_index(op.f('ix_location_segments_user_id'), table_name='location_segments')
  op.drop_index(op.f('ix_location_segments_deleted_at'), table_name='location_segments')
  op.drop_index(op.f('ix_location_segments_created_at'), table_name='location_segments')
  op.drop_table('location_segments')
  op.drop_index(op.f('ix_location_imports_user_id'), table_name='location_imports')
  op.drop_index(op.f('ix_location_imports_deleted_at'), table_name='location_imports')
  op.drop_index(op.f('ix_location_imports_created_at'), table_name='location_imports')
  op.drop_table('location_imports')
