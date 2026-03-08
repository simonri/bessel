"""create journal entries table

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-03-08 00:03:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

# revision identifiers, used by Alembic.
revision: str = "l2m3n4o5p6q7"
down_revision: str | Sequence[str] | None = "k1l2m3n4o5p6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "journal_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("mood", sa.Integer(), nullable=True),
        sa.Column("energy", sa.Integer(), nullable=True),
        sa.Column("focus", sa.Integer(), nullable=True),
        sa.Column("sleep_hours", sa.Float(), nullable=True),
        sa.Column("wins", sa.Text(), nullable=True),
        sa.Column("blockers", sa.Text(), nullable=True),
        sa.Column("learnings", sa.Text(), nullable=True),
        sa.Column("gratitude", sa.Text(), nullable=True),
        sa.Column("intention", sa.Text(), nullable=True),
        sa.Column("decisions", JSONB(), nullable=True),
        sa.Column("tags", ARRAY(sa.String(50)), nullable=True),
        sa.Column("word_count", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id", name=op.f("journal_entries_pkey")),
        sa.UniqueConstraint("entry_date", name=op.f("journal_entries_entry_date_key")),
    )
    op.create_index(op.f("ix_journal_entries_created_at"), "journal_entries", ["created_at"])
    op.create_index(op.f("ix_journal_entries_deleted_at"), "journal_entries", ["deleted_at"])
    op.create_index(op.f("ix_journal_entries_entry_date"), "journal_entries", ["entry_date"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_journal_entries_entry_date"), table_name="journal_entries")
    op.drop_index(op.f("ix_journal_entries_deleted_at"), table_name="journal_entries")
    op.drop_index(op.f("ix_journal_entries_created_at"), table_name="journal_entries")
    op.drop_table("journal_entries")
