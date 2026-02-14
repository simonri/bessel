"""remove users table and user_id columns

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-02-14 00:03:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  # Drop user_id FK and column from transactions
  op.drop_constraint(op.f("transactions_user_id_fkey"), "transactions", type_="foreignkey")
  op.drop_column("transactions", "user_id")

  # Drop user_id FK and column from bank_accounts
  op.drop_constraint(op.f("bank_accounts_user_id_fkey"), "bank_accounts", type_="foreignkey")
  op.drop_column("bank_accounts", "user_id")

  # Drop user_id FK and column from import_batches
  op.drop_constraint(op.f("import_batches_user_id_fkey"), "import_batches", type_="foreignkey")
  op.drop_column("import_batches", "user_id")

  # Drop users table
  op.drop_index(op.f("ix_users_deleted_at"), table_name="users")
  op.drop_index(op.f("ix_users_created_at"), table_name="users")
  op.drop_table("users")


def downgrade() -> None:
  """Downgrade schema."""
  # Recreate users table
  op.create_table(
    "users",
    sa.Column("email", sa.String(length=255), nullable=False),
    sa.Column("id", sa.Uuid(), nullable=False),
    sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint("id", name=op.f("users_pkey")),
    sa.UniqueConstraint("email", name=op.f("users_email_key")),
  )
  op.create_index(op.f("ix_users_created_at"), "users", ["created_at"], unique=False)
  op.create_index(op.f("ix_users_deleted_at"), "users", ["deleted_at"], unique=False)

  # Re-add user_id to import_batches
  op.add_column("import_batches", sa.Column("user_id", sa.Uuid(), nullable=False))
  op.create_foreign_key(op.f("import_batches_user_id_fkey"), "import_batches", "users", ["user_id"], ["id"], onupdate="CASCADE")

  # Re-add user_id to bank_accounts
  op.add_column("bank_accounts", sa.Column("user_id", sa.Uuid(), nullable=False))
  op.create_foreign_key(op.f("bank_accounts_user_id_fkey"), "bank_accounts", "users", ["user_id"], ["id"], onupdate="CASCADE")

  # Re-add user_id to transactions
  op.add_column("transactions", sa.Column("user_id", sa.Uuid(), nullable=False))
  op.create_foreign_key(op.f("transactions_user_id_fkey"), "transactions", "users", ["user_id"], ["id"], onupdate="CASCADE")
