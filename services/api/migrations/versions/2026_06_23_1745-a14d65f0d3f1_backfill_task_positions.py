"""backfill_task_positions

Revision ID: a14d65f0d3f1
Revises: 7ee8bf1e4ee4
Create Date: 2026-06-23 17:45:38.201817

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a14d65f0d3f1'
down_revision: str | Sequence[str] | None = '7ee8bf1e4ee4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Assign distinct positions to tasks, ordered by priority/due_date within each status."""
  op.execute("""
    WITH ranked AS (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY status
                ORDER BY priority DESC, due_date ASC NULLS LAST, created_at ASC
            ) * 1000 AS new_position
        FROM tasks
    )
    UPDATE tasks
    SET position = ranked.new_position
    FROM ranked
    WHERE tasks.id = ranked.id
  """)


def downgrade() -> None:
  """Reset all positions to 0."""
  op.execute('UPDATE tasks SET position = 0')
