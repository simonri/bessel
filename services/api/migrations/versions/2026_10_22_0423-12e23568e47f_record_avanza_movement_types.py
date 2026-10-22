"""record avanza movement types

Revision ID: 12e23568e47f
Revises: b9674e55ea85
Create Date: 2026-10-22 04:23:55.575718

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '12e23568e47f'
down_revision: str | Sequence[str] | None = 'b9674e55ea85'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Avanza cash movements already imported get their kind (DEPOSIT, DIVIDEND, ...) from the raw row."""
  op.execute(
    """
    UPDATE transactions AS t
    SET transaction_type = r.raw_data ->> 'type'
    FROM raw_transactions AS r
    JOIN import_batches AS b ON b.id = r.batch_id
    WHERE t.raw_id = r.id AND b.bank_name = 'avanza' AND t.transaction_type IS NULL
    """
  )


def downgrade() -> None:
  """The types stay; they're harmless and new imports set them anyway."""
