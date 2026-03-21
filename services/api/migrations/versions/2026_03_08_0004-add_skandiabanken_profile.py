"""add skandiabanken bank profile

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-03-08 00:04:00.000000

"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "m3n4o5p6q7r8"
down_revision: str | Sequence[str] | None = "l2m3n4o5p6q7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  column_map = json.dumps(
    {
      "transaction_date": "Bokf. datum",
      "amount": "Belopp",
      "description": "Beskrivning",
      "balance": "Saldo",
      "account_number_cell": "B1",
    }
  )
  op.execute(
    sa.text(
      """
      INSERT INTO bank_profiles (id, bank_name, file_format, column_map, skip_rows, decimal_separator, delimiter, currency, created_at)
      VALUES (gen_random_uuid(), 'skandiabanken', 'xlsx', CAST(:column_map AS jsonb), 3, '.', ',', 'SEK', now())
      """
    ).bindparams(column_map=column_map)
  )


def downgrade() -> None:
  """Downgrade schema."""
  op.execute(sa.text("DELETE FROM bank_profiles WHERE bank_name = 'skandiabanken'"))
