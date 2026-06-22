"""add_tree_of_alpha_news

Revision ID: fbe9af52fb6c
Revises: cab51a1f5594
Create Date: 2026-06-22 22:14:52.184474

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'fbe9af52fb6c'
down_revision: str | Sequence[str] | None = 'cab51a1f5594'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.create_table(
    'tree_of_alpha_news',
    sa.Column('external_id', sa.String(length=255), nullable=False),
    sa.Column('title', sa.Text(), nullable=False),
    sa.Column('url', sa.Text(), nullable=True),
    sa.Column('source', sa.String(length=100), nullable=True),
    sa.Column('likes', sa.Integer(), nullable=False),
    sa.Column('published_at', sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column('notification_sent_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column('modified_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('tree_of_alpha_news_pkey')),
    sa.UniqueConstraint('external_id', name=op.f('tree_of_alpha_news_external_id_key')),
  )
  op.create_index(op.f('ix_tree_of_alpha_news_created_at'), 'tree_of_alpha_news', ['created_at'], unique=False)
  op.create_index(op.f('ix_tree_of_alpha_news_deleted_at'), 'tree_of_alpha_news', ['deleted_at'], unique=False)


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_index(op.f('ix_tree_of_alpha_news_deleted_at'), table_name='tree_of_alpha_news')
  op.drop_index(op.f('ix_tree_of_alpha_news_created_at'), table_name='tree_of_alpha_news')
  op.drop_table('tree_of_alpha_news')
