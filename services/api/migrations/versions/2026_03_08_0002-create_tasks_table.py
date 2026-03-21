"""create tasks table

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-03-08 00:02:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

# revision identifiers, used by Alembic.
revision: str = "k1l2m3n4o5p6"
down_revision: str | Sequence[str] | None = "j0k1l2m3n4o5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.create_table(
    "tasks",
    sa.Column("id", sa.Uuid(), nullable=False),
    sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column("title", sa.String(500), nullable=False),
    sa.Column("description", sa.Text(), nullable=True),
    sa.Column("status", sa.String(20), nullable=False, server_default="todo"),
    sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("due_date", sa.Date(), nullable=True),
    sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column("project", sa.String(100), nullable=True),
    sa.Column("area", sa.String(100), nullable=True),
    sa.Column("tags", ARRAY(sa.String(50)), nullable=True),
    sa.Column("position", sa.Float(), nullable=False, server_default="0"),
    sa.Column("is_recurring", sa.Boolean(), nullable=False, server_default="false"),
    sa.Column("rrule_frequency", sa.String(20), nullable=True),
    sa.Column("rrule_interval", sa.Integer(), nullable=True),
    sa.Column("rrule_day_of_week", sa.Integer(), nullable=True),
    sa.Column("rrule_day_of_month", sa.Integer(), nullable=True),
    sa.Column("parent_task_id", sa.Uuid(), nullable=True),
    sa.PrimaryKeyConstraint("id", name=op.f("tasks_pkey")),
    sa.ForeignKeyConstraint(["parent_task_id"], ["tasks.id"], name=op.f("tasks_parent_task_id_fkey")),
  )
  op.create_index(op.f("ix_tasks_created_at"), "tasks", ["created_at"])
  op.create_index(op.f("ix_tasks_deleted_at"), "tasks", ["deleted_at"])
  op.create_index(op.f("ix_tasks_status"), "tasks", ["status"])
  op.create_index(op.f("ix_tasks_due_date"), "tasks", ["due_date"])
  op.create_index(op.f("ix_tasks_project"), "tasks", ["project"])
  op.create_index(op.f("ix_tasks_area"), "tasks", ["area"])


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_index(op.f("ix_tasks_area"), table_name="tasks")
  op.drop_index(op.f("ix_tasks_project"), table_name="tasks")
  op.drop_index(op.f("ix_tasks_due_date"), table_name="tasks")
  op.drop_index(op.f("ix_tasks_status"), table_name="tasks")
  op.drop_index(op.f("ix_tasks_deleted_at"), table_name="tasks")
  op.drop_index(op.f("ix_tasks_created_at"), table_name="tasks")
  op.drop_table("tasks")
