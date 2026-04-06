"""replace journal with frictionless schema

Revision ID: 06268fcd3991
Revises: c4f80725fd68
Create Date: 2026-04-06 16:54:30.086326

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '06268fcd3991'
down_revision: str | Sequence[str] | None = 'c4f80725fd68'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  # Add new frictionless journal columns
  op.add_column('journal_entries', sa.Column('priority', sa.Text(), nullable=True))
  op.add_column('journal_entries', sa.Column('friction', sa.Text(), nullable=True))
  op.add_column('journal_entries', sa.Column('gratitude_1', sa.Text(), nullable=True))
  op.add_column('journal_entries', sa.Column('gratitude_2', sa.Text(), nullable=True))
  op.add_column('journal_entries', sa.Column('gratitude_3', sa.Text(), nullable=True))
  op.add_column('journal_entries', sa.Column('morning_committed_at', postgresql.TIMESTAMP(timezone=True), nullable=True))
  op.add_column('journal_entries', sa.Column('captures', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
  op.add_column('journal_entries', sa.Column('scorecard', sa.Integer(), nullable=True))
  op.add_column('journal_entries', sa.Column('priority_done', sa.Boolean(), nullable=True))
  op.add_column('journal_entries', sa.Column('insight', sa.Text(), nullable=True))
  op.add_column('journal_entries', sa.Column('seed', sa.Text(), nullable=True))
  # Drop old journal columns
  op.drop_column('journal_entries', 'word_count')
  op.drop_column('journal_entries', 'body')
  op.drop_column('journal_entries', 'intention')
  op.drop_column('journal_entries', 'decisions')
  op.drop_column('journal_entries', 'sleep_hours')
  op.drop_column('journal_entries', 'tags')
  op.drop_column('journal_entries', 'learnings')
  op.drop_column('journal_entries', 'blockers')
  op.drop_column('journal_entries', 'wins')
  op.drop_column('journal_entries', 'gratitude')
  op.drop_column('journal_entries', 'mood')
  op.drop_column('journal_entries', 'energy')
  op.drop_column('journal_entries', 'focus')


def downgrade() -> None:
  """Downgrade schema."""
  op.add_column('journal_entries', sa.Column('focus', sa.INTEGER(), autoincrement=False, nullable=True))
  op.add_column('journal_entries', sa.Column('energy', sa.INTEGER(), autoincrement=False, nullable=True))
  op.add_column('journal_entries', sa.Column('mood', sa.INTEGER(), autoincrement=False, nullable=True))
  op.add_column('journal_entries', sa.Column('gratitude', sa.TEXT(), autoincrement=False, nullable=True))
  op.add_column('journal_entries', sa.Column('wins', sa.TEXT(), autoincrement=False, nullable=True))
  op.add_column('journal_entries', sa.Column('blockers', sa.TEXT(), autoincrement=False, nullable=True))
  op.add_column('journal_entries', sa.Column('learnings', sa.TEXT(), autoincrement=False, nullable=True))
  op.add_column('journal_entries', sa.Column('tags', postgresql.ARRAY(sa.VARCHAR(length=50)), autoincrement=False, nullable=True))
  op.add_column('journal_entries', sa.Column('sleep_hours', sa.DOUBLE_PRECISION(precision=53), autoincrement=False, nullable=True))
  op.add_column('journal_entries', sa.Column('decisions', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True))
  op.add_column('journal_entries', sa.Column('intention', sa.TEXT(), autoincrement=False, nullable=True))
  op.add_column('journal_entries', sa.Column('body', sa.TEXT(), autoincrement=False, nullable=True))
  op.add_column('journal_entries', sa.Column('word_count', sa.INTEGER(), server_default=sa.text('0'), autoincrement=False, nullable=False))
  op.drop_column('journal_entries', 'seed')
  op.drop_column('journal_entries', 'insight')
  op.drop_column('journal_entries', 'priority_done')
  op.drop_column('journal_entries', 'scorecard')
  op.drop_column('journal_entries', 'captures')
  op.drop_column('journal_entries', 'morning_committed_at')
  op.drop_column('journal_entries', 'gratitude_3')
  op.drop_column('journal_entries', 'gratitude_2')
  op.drop_column('journal_entries', 'gratitude_1')
  op.drop_column('journal_entries', 'friction')
  op.drop_column('journal_entries', 'priority')
