"""merge devices and healthkit workout branches

Revision ID: 63b13bca046b
Revises: 1dea22e255cb, 3ed794c4c4a6
Create Date: 2026-07-14 01:59:50.924195

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = '63b13bca046b'
down_revision: str | Sequence[str] | None = ('1dea22e255cb', '3ed794c4c4a6')
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""


def downgrade() -> None:
  """Downgrade schema."""
