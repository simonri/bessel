"""widen dedup_hash column to 70 chars

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-03-08 00:06:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "o5p6q7r8s9t0"
down_revision: str | Sequence[str] | None = "n4o5p6q7r8s9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.alter_column("transactions", "dedup_hash", type_=sa.String(70), existing_type=sa.String(64))


def downgrade() -> None:
  """Downgrade schema."""
  op.alter_column("transactions", "dedup_hash", type_=sa.String(64), existing_type=sa.String(70))
