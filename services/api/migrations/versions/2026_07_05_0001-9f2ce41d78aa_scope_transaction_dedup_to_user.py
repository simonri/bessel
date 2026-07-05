"""scope transaction dedup_hash uniqueness to user

Revision ID: 9f2ce41d78aa
Revises: 065c54d9371e
Create Date: 2026-07-05

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9f2ce41d78aa"
down_revision: str | Sequence[str] | None = "065c54d9371e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  op.drop_constraint("transactions_dedup_hash_key", "transactions", type_="unique")
  op.create_unique_constraint(
    "transactions_user_id_dedup_hash_key",
    "transactions",
    ["user_id", "dedup_hash"],
  )


def downgrade() -> None:
  op.drop_constraint("transactions_user_id_dedup_hash_key", "transactions", type_="unique")
  op.create_unique_constraint("transactions_dedup_hash_key", "transactions", ["dedup_hash"])
