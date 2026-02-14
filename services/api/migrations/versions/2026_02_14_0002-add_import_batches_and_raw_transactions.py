"""add import_batches and raw_transactions tables

Revision ID: b2c3d4e5f6a7
Revises: b73ef216f17a
Create Date: 2026-02-14 00:02:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: str | Sequence[str] | None = "b73ef216f17a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.create_table(
    "import_batches",
    sa.Column("bank_name", sa.String(length=255), nullable=False),
    sa.Column("file_format", sa.String(length=50), nullable=False),
    sa.Column("raw_content", sa.Text(), nullable=False),
    sa.Column("row_count", sa.Integer(), nullable=False),
    sa.Column("user_id", sa.Uuid(), nullable=False),
    sa.Column("id", sa.Uuid(), nullable=False),
    sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("import_batches_user_id_fkey"), onupdate="CASCADE"),
    sa.PrimaryKeyConstraint("id", name=op.f("import_batches_pkey")),
  )
  op.create_index(op.f("ix_import_batches_created_at"), "import_batches", ["created_at"], unique=False)
  op.create_index(op.f("ix_import_batches_deleted_at"), "import_batches", ["deleted_at"], unique=False)

  op.create_table(
    "raw_transactions",
    sa.Column("row_number", sa.Integer(), nullable=False),
    sa.Column("raw_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column("batch_id", sa.Uuid(), nullable=False),
    sa.Column("id", sa.Uuid(), nullable=False),
    sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(["batch_id"], ["import_batches.id"], name=op.f("raw_transactions_batch_id_fkey"), onupdate="CASCADE"),
    sa.PrimaryKeyConstraint("id", name=op.f("raw_transactions_pkey")),
  )
  op.create_index(op.f("ix_raw_transactions_created_at"), "raw_transactions", ["created_at"], unique=False)
  op.create_index(op.f("ix_raw_transactions_deleted_at"), "raw_transactions", ["deleted_at"], unique=False)


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_index(op.f("ix_raw_transactions_deleted_at"), table_name="raw_transactions")
  op.drop_index(op.f("ix_raw_transactions_created_at"), table_name="raw_transactions")
  op.drop_table("raw_transactions")
  op.drop_index(op.f("ix_import_batches_deleted_at"), table_name="import_batches")
  op.drop_index(op.f("ix_import_batches_created_at"), table_name="import_batches")
  op.drop_table("import_batches")
