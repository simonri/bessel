"""add transaction fields: direction, dedup_hash, currency, raw_id; rename date->transaction_date; change amount to integer

Revision ID: a1b2c3d4e5f6
Revises: b73ef216f17a
Create Date: 2026-02-14 00:01:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  # Change amount from Numeric(10,2) to Integer (minor units / cents)
  op.alter_column(
    "transactions",
    "amount",
    existing_type=sa.Numeric(precision=10, scale=2),
    type_=sa.Integer(),
    existing_nullable=False,
    postgresql_using="(amount * 100)::integer",
  )

  # Rename date -> transaction_date
  op.alter_column("transactions", "date", new_column_name="transaction_date")

  # Add currency column
  op.add_column("transactions", sa.Column("currency", sa.String(length=3), nullable=False, server_default="SEK"))
  op.alter_column("transactions", "currency", server_default=None)

  # Add direction enum and column
  transactiondirection = sa.Enum("debit", "credit", name="transactiondirection")
  transactiondirection.create(op.get_bind(), checkfirst=True)
  op.add_column("transactions", sa.Column("direction", transactiondirection, nullable=False, server_default="debit"))
  op.alter_column("transactions", "direction", server_default=None)

  # Add dedup_hash column
  op.add_column("transactions", sa.Column("dedup_hash", sa.String(length=64), nullable=False, server_default=""))
  op.alter_column("transactions", "dedup_hash", server_default=None)
  op.create_unique_constraint(op.f("transactions_dedup_hash_key"), "transactions", ["dedup_hash"])

  # Add raw_id FK to raw_transactions (nullable)
  op.add_column("transactions", sa.Column("raw_id", sa.Uuid(), nullable=True))
  op.create_foreign_key(op.f("transactions_raw_id_fkey"), "transactions", "raw_transactions", ["raw_id"], ["id"], onupdate="CASCADE")


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_constraint(op.f("transactions_raw_id_fkey"), "transactions", type_="foreignkey")
  op.drop_column("transactions", "raw_id")

  op.drop_constraint(op.f("transactions_dedup_hash_key"), "transactions", type_="unique")
  op.drop_column("transactions", "dedup_hash")
  op.drop_column("transactions", "direction")
  sa.Enum(name="transactiondirection").drop(op.get_bind(), checkfirst=True)
  op.drop_column("transactions", "currency")

  # Rename transaction_date -> date
  op.alter_column("transactions", "transaction_date", new_column_name="date")

  op.alter_column(
    "transactions",
    "amount",
    existing_type=sa.Integer(),
    type_=sa.Numeric(precision=10, scale=2),
    existing_nullable=False,
    postgresql_using="(amount::numeric / 100)",
  )
