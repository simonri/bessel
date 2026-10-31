"""pg_trgm for memory search

Revision ID: 3c1d8e5a9f20
Revises: 119bb42952e7
Create Date: 2026-10-31 12:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '3c1d8e5a9f20'
down_revision: str | Sequence[str] | None = '119bb42952e7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  # Memory search matches compounds and misspellings by trigram word similarity.
  op.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')


def downgrade() -> None:
  """Downgrade schema."""
  op.execute('DROP EXTENSION IF EXISTS pg_trgm')
