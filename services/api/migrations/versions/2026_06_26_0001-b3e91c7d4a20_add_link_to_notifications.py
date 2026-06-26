"""add link to notifications

Revision ID: b3e91c7d4a20
Revises: ca60bd695ed2
Create Date: 2026-06-26 00:01:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "b3e91c7d4a20"
down_revision = "ca60bd695ed2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notifications", sa.Column("link", sa.Text(), nullable=True))
    # Migrate existing notifications: body values that look like URLs become link
    op.execute(
        "UPDATE notifications SET link = body, body = NULL WHERE body LIKE 'http%'"
    )


def downgrade() -> None:
    # Restore URL links back to body on downgrade
    op.execute(
        "UPDATE notifications SET body = link WHERE link IS NOT NULL AND body IS NULL"
    )
    op.drop_column("notifications", "link")
