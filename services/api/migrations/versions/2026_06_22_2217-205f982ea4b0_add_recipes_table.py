"""add recipes table

Revision ID: 205f982ea4b0
Revises: fbe9af52fb6c
Create Date: 2026-06-22 22:17:11.674353

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '205f982ea4b0'
down_revision: str | Sequence[str] | None = 'fbe9af52fb6c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  op.create_table(
    'recipes',
    sa.Column('title', sa.String(length=500), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column('modified_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.TIMESTAMP(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('recipes_pkey')),
  )
  op.create_index(op.f('ix_recipes_created_at'), 'recipes', ['created_at'], unique=False)
  op.create_index(op.f('ix_recipes_deleted_at'), 'recipes', ['deleted_at'], unique=False)
  op.create_index(op.f('ix_recipes_title'), 'recipes', ['title'], unique=False)


def downgrade() -> None:
  op.drop_index(op.f('ix_recipes_title'), table_name='recipes')
  op.drop_index(op.f('ix_recipes_deleted_at'), table_name='recipes')
  op.drop_index(op.f('ix_recipes_created_at'), table_name='recipes')
  op.drop_table('recipes')
