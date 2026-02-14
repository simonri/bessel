"""add description, category, transaction_type to transactions

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-02-14 00:05:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d0"
down_revision: str | Sequence[str] | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("transactions", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("transactions", sa.Column("category", sa.String(length=255), nullable=True))
    op.add_column("transactions", sa.Column("transaction_type", sa.String(length=50), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("transactions", "transaction_type")
    op.drop_column("transactions", "category")
    op.drop_column("transactions", "description")
