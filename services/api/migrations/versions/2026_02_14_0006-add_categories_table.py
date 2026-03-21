"""add categories table and replace transactions.category string with category_id FK

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-02-14 00:06:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f6a7b8c9d0e1"
down_revision: str | Sequence[str] | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_CATEGORIES = [
  ("Groceries", "#22C55E"),
  ("Transport", "#3B82F6"),
  ("Salary", "#10B981"),
  ("Dining", "#F59E0B"),
  ("Entertainment", "#8B5CF6"),
  ("Healthcare", "#EF4444"),
  ("Utilities", "#6366F1"),
  ("Shopping", "#EC4899"),
  ("Subscriptions", "#14B8A6"),
  ("Transfers", "#6B7280"),
]


def upgrade() -> None:
  """Upgrade schema."""
  # 1. Create categories table
  op.create_table(
    "categories",
    sa.Column("name", sa.String(length=100), nullable=False),
    sa.Column("color", sa.String(length=7), nullable=False, server_default="#6B7280"),
    sa.Column("id", sa.Uuid(), nullable=False),
    sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint("id", name=op.f("categories_pkey")),
    sa.UniqueConstraint("name", name=op.f("categories_name_key")),
  )
  op.create_index(op.f("ix_categories_created_at"), "categories", ["created_at"], unique=False)
  op.create_index(op.f("ix_categories_deleted_at"), "categories", ["deleted_at"], unique=False)

  # 2. Seed default categories
  for name, color in DEFAULT_CATEGORIES:
    op.execute(
      sa.text("INSERT INTO categories (id, name, color, created_at) VALUES (gen_random_uuid(), :name, :color, now())").bindparams(name=name, color=color)
    )

  # 3. Drop old category string column from transactions
  op.drop_column("transactions", "category")

  # 4. Add category_id FK column
  op.add_column("transactions", sa.Column("category_id", sa.Uuid(), nullable=True))
  op.create_foreign_key(
    op.f("transactions_category_id_fkey"),
    "transactions",
    "categories",
    ["category_id"],
    ["id"],
    onupdate="CASCADE",
    ondelete="SET NULL",
  )


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_constraint(op.f("transactions_category_id_fkey"), "transactions", type_="foreignkey")
  op.drop_column("transactions", "category_id")

  op.add_column("transactions", sa.Column("category", sa.String(length=255), nullable=True))

  op.drop_index(op.f("ix_categories_deleted_at"), table_name="categories")
  op.drop_index(op.f("ix_categories_created_at"), table_name="categories")
  op.drop_table("categories")
