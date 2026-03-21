"""add bank_profiles table with marginalen seed

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-02-14 00:04:00.000000

"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.create_table(
    "bank_profiles",
    sa.Column("bank_name", sa.String(length=255), nullable=False),
    sa.Column("file_format", sa.String(length=50), nullable=False),
    sa.Column("column_map", JSONB(), nullable=False),
    sa.Column("skip_rows", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("decimal_separator", sa.String(length=5), nullable=False, server_default="."),
    sa.Column("delimiter", sa.String(length=5), nullable=False, server_default=","),
    sa.Column("currency", sa.String(length=3), nullable=False, server_default="USD"),
    sa.Column("id", sa.Uuid(), nullable=False),
    sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint("id", name=op.f("bank_profiles_pkey")),
    sa.UniqueConstraint("bank_name", name=op.f("bank_profiles_bank_name_key")),
  )
  op.create_index(op.f("ix_bank_profiles_created_at"), "bank_profiles", ["created_at"], unique=False)
  op.create_index(op.f("ix_bank_profiles_deleted_at"), "bank_profiles", ["deleted_at"], unique=False)

  # Seed Marginalen profile
  column_map = json.dumps(
    {
      "account_number": "Frånkontonummer",
      "transaction_date": "Bokföringsdatum",
      "currency": "Valuta",
      "amount": "Belopp",
      "description": "Transaktionstext",
    }
  )
  op.execute(
    sa.text(
      """
      INSERT INTO bank_profiles (id, bank_name, file_format, column_map, skip_rows, decimal_separator, delimiter, currency, created_at)
      VALUES (gen_random_uuid(), 'marginalen', 'csv', CAST(:column_map AS jsonb), 0, ',', ';', 'SEK', now())
      """
    ).bindparams(column_map=column_map)
  )


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_index(op.f("ix_bank_profiles_deleted_at"), table_name="bank_profiles")
  op.drop_index(op.f("ix_bank_profiles_created_at"), table_name="bank_profiles")
  op.drop_table("bank_profiles")
