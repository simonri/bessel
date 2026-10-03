"""isolate user data: ingest tokens, required owners, per-user dedupe keys

Revision ID: 5e1a9c2d7f30
Revises: c4721c5a1cc0
Create Date: 2026-10-03 04:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5e1a9c2d7f30"
down_revision: str | Sequence[str] | None = "c4721c5a1cc0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Every table whose rows belong to exactly one user.
OWNED_TABLES = [
  "tasks",
  "projects",
  "categories",
  "transactions",
  "bank_accounts",
  "places",
  "counters",
  "counter_resets",
  "recipes",
  "notifications",
  "activity_events",
  "trades",
  "healthkit_workouts",
  "healthkit_sleep_samples",
  "agent_usage_daily",
  "agent_usage_status",
  "import_batches",
]


def upgrade() -> None:
  op.create_table(
    "ingest_tokens",
    sa.Column("user_id", sa.Uuid(), nullable=False),
    sa.Column("name", sa.String(length=100), nullable=False),
    sa.Column("token_hash", sa.String(length=64), nullable=False),
    sa.Column("last_used_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column("id", sa.Uuid(), nullable=False),
    sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("ingest_tokens_user_id_fkey")),
    sa.PrimaryKeyConstraint("id", name=op.f("ingest_tokens_pkey")),
    sa.UniqueConstraint("token_hash", name="ingest_tokens_token_hash_key"),
  )
  op.create_index(op.f("ix_ingest_tokens_created_at"), "ingest_tokens", ["created_at"], unique=False)
  op.create_index(op.f("ix_ingest_tokens_deleted_at"), "ingest_tokens", ["deleted_at"], unique=False)
  op.create_index(op.f("ix_ingest_tokens_user_id"), "ingest_tokens", ["user_id"], unique=False)

  op.add_column("import_batches", sa.Column("user_id", sa.Uuid(), nullable=True))
  op.create_foreign_key(op.f("import_batches_user_id_fkey"), "import_batches", "users", ["user_id"], ["id"])
  op.create_index(op.f("ix_import_batches_user_id"), "import_batches", ["user_id"], unique=False)

  # Rows written before ownership was enforced (daemon ingest, pre-signup
  # data) have no owner. They all belong to the instance's original user.
  conn = op.get_bind()
  owner_id = conn.execute(sa.text("SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1")).scalar()
  orphaned = {table: conn.execute(sa.text(f"SELECT count(*) FROM {table} WHERE user_id IS NULL")).scalar() for table in OWNED_TABLES}
  if any(orphaned.values()):
    if owner_id is None:
      raise RuntimeError(f"Rows without an owner but no user to assign them to: {orphaned}. Log in once to create your user, then rerun the migration.")
    for table, count in orphaned.items():
      if count:
        conn.execute(sa.text(f"UPDATE {table} SET user_id = :owner WHERE user_id IS NULL"), {"owner": owner_id})

  for table in OWNED_TABLES:
    op.alter_column(table, "user_id", existing_type=sa.Uuid(), nullable=False)

  op.drop_constraint("activity_events_source_local_id_key", "activity_events", type_="unique")
  op.create_unique_constraint("activity_events_user_id_source_local_id_key", "activity_events", ["user_id", "source", "local_id"])
  op.drop_index("ix_activity_events_source_ts", table_name="activity_events")
  op.create_index("ix_activity_events_user_id_source_ts", "activity_events", ["user_id", "source", "ts"], unique=False)

  op.drop_constraint("agent_usage_daily_device_agent_date_model_key", "agent_usage_daily", type_="unique")
  op.create_unique_constraint("agent_usage_daily_user_id_device_agent_date_model_key", "agent_usage_daily", ["user_id", "device", "agent", "date", "model"])
  op.drop_constraint("agent_usage_status_device_agent_window_label_key", "agent_usage_status", type_="unique")
  op.create_unique_constraint("agent_usage_status_user_id_device_agent_window_label_key", "agent_usage_status", ["user_id", "device", "agent", "window_label"])


def downgrade() -> None:
  op.drop_constraint("agent_usage_status_user_id_device_agent_window_label_key", "agent_usage_status", type_="unique")
  op.create_unique_constraint("agent_usage_status_device_agent_window_label_key", "agent_usage_status", ["device", "agent", "window_label"])
  op.drop_constraint("agent_usage_daily_user_id_device_agent_date_model_key", "agent_usage_daily", type_="unique")
  op.create_unique_constraint("agent_usage_daily_device_agent_date_model_key", "agent_usage_daily", ["device", "agent", "date", "model"])

  op.drop_index("ix_activity_events_user_id_source_ts", table_name="activity_events")
  op.create_index("ix_activity_events_source_ts", "activity_events", ["source", "ts"], unique=False)
  op.drop_constraint("activity_events_user_id_source_local_id_key", "activity_events", type_="unique")
  op.create_unique_constraint("activity_events_source_local_id_key", "activity_events", ["source", "local_id"])

  for table in OWNED_TABLES:
    if table != "import_batches":
      op.alter_column(table, "user_id", existing_type=sa.Uuid(), nullable=True)

  op.drop_index(op.f("ix_import_batches_user_id"), table_name="import_batches")
  op.drop_constraint(op.f("import_batches_user_id_fkey"), "import_batches", type_="foreignkey")
  op.drop_column("import_batches", "user_id")

  op.drop_index(op.f("ix_ingest_tokens_user_id"), table_name="ingest_tokens")
  op.drop_index(op.f("ix_ingest_tokens_deleted_at"), table_name="ingest_tokens")
  op.drop_index(op.f("ix_ingest_tokens_created_at"), table_name="ingest_tokens")
  op.drop_table("ingest_tokens")
