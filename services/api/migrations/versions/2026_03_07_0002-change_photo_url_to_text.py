"""change places.photo_url from varchar(500) to text

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-03-07 00:02:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "h8i9j0k1l2m3"
down_revision: str | Sequence[str] | None = "g7h8i9j0k1l2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("places", "photo_url", type_=sa.Text(), existing_type=sa.String(500))


def downgrade() -> None:
    op.alter_column("places", "photo_url", type_=sa.String(500), existing_type=sa.Text())
