"""add places table

Revision ID: g7h8i9j0k1l2
Revises: f6a7b8c9d0e1
Create Date: 2026-03-07 00:01:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "g7h8i9j0k1l2"
down_revision: str | Sequence[str] | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
  """Upgrade schema."""
  op.create_table(
    "places",
    sa.Column("name", sa.String(length=255), nullable=False),
    sa.Column("address", sa.String(length=500), nullable=True),
    sa.Column("latitude", sa.Float(), nullable=False),
    sa.Column("longitude", sa.Float(), nullable=False),
    sa.Column("google_place_id", sa.String(length=255), nullable=True),
    sa.Column("plus_code", sa.String(length=50), nullable=True),
    sa.Column("rating", sa.Integer(), nullable=True),
    sa.Column("visited", sa.Boolean(), nullable=False, server_default="false"),
    sa.Column("review", sa.Text(), nullable=True),
    sa.Column("category", sa.String(length=100), nullable=True),
    sa.Column("photo_url", sa.String(length=500), nullable=True),
    sa.Column("website", sa.String(length=500), nullable=True),
    sa.Column("phone", sa.String(length=50), nullable=True),
    sa.Column("id", sa.Uuid(), nullable=False),
    sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
    sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint("id", name=op.f("places_pkey")),
    sa.UniqueConstraint("google_place_id", name=op.f("places_google_place_id_key")),
  )
  op.create_index(op.f("ix_places_created_at"), "places", ["created_at"], unique=False)
  op.create_index(op.f("ix_places_deleted_at"), "places", ["deleted_at"], unique=False)


def downgrade() -> None:
  """Downgrade schema."""
  op.drop_index(op.f("ix_places_deleted_at"), table_name="places")
  op.drop_index(op.f("ix_places_created_at"), table_name="places")
  op.drop_table("places")
