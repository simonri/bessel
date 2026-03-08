"""create securities, trades, and security_prices tables

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-03-08 00:07:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "p6q7r8s9t0u1"
down_revision: str | Sequence[str] | None = "o5p6q7r8s9t0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

asset_type_enum = postgresql.ENUM("stock", "etf", "mutual_fund", "bond", "crypto", "real_estate", "other", name="assettype", create_type=False)
trade_type_enum = postgresql.ENUM("buy", "sell", name="tradetype", create_type=False)


def upgrade() -> None:
  """Create investment tables."""
  op.execute("CREATE TYPE assettype AS ENUM ('stock', 'etf', 'mutual_fund', 'bond', 'crypto', 'real_estate', 'other')")
  op.execute("CREATE TYPE tradetype AS ENUM ('buy', 'sell')")

  op.create_table(
    "securities",
    sa.Column("id", sa.Uuid(), nullable=False),
    sa.Column("name", sa.String(255), nullable=False),
    sa.Column("ticker", sa.String(20), nullable=True),
    sa.Column("asset_type", asset_type_enum, nullable=False),
    sa.Column("currency", sa.String(3), nullable=False),
    sa.Column("notes", sa.Text(), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    sa.Column("modified_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint("id"),
  )
  op.create_index("ix_securities_deleted_at", "securities", ["deleted_at"])

  op.create_table(
    "trades",
    sa.Column("id", sa.Uuid(), nullable=False),
    sa.Column("security_id", sa.Uuid(), nullable=False),
    sa.Column("bank_account_id", sa.Uuid(), nullable=False),
    sa.Column("trade_type", trade_type_enum, nullable=False),
    sa.Column("trade_date", sa.Date(), nullable=False),
    sa.Column("quantity", sa.BigInteger(), nullable=False),
    sa.Column("price_per_unit", sa.Integer(), nullable=False),
    sa.Column("currency", sa.String(3), nullable=False),
    sa.Column("notes", sa.Text(), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    sa.Column("modified_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint("id"),
    sa.ForeignKeyConstraint(["security_id"], ["securities.id"], ondelete="CASCADE"),
    sa.ForeignKeyConstraint(["bank_account_id"], ["bank_accounts.id"], ondelete="CASCADE"),
  )
  op.create_index("ix_trades_security_id", "trades", ["security_id"])
  op.create_index("ix_trades_bank_account_id", "trades", ["bank_account_id"])
  op.create_index("ix_trades_deleted_at", "trades", ["deleted_at"])

  op.create_table(
    "security_prices",
    sa.Column("id", sa.Uuid(), nullable=False),
    sa.Column("security_id", sa.Uuid(), nullable=False),
    sa.Column("price_date", sa.Date(), nullable=False),
    sa.Column("price_per_unit", sa.Integer(), nullable=False),
    sa.Column("currency", sa.String(3), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    sa.Column("modified_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint("id"),
    sa.ForeignKeyConstraint(["security_id"], ["securities.id"], ondelete="CASCADE"),
    sa.UniqueConstraint("security_id", "price_date", name="security_prices_security_id_price_date_key"),
  )
  op.create_index("ix_security_prices_security_id", "security_prices", ["security_id"])
  op.create_index("ix_security_prices_deleted_at", "security_prices", ["deleted_at"])


def downgrade() -> None:
  """Drop investment tables."""
  op.drop_table("security_prices")
  op.drop_table("trades")
  op.drop_table("securities")
  op.execute("DROP TYPE tradetype")
  op.execute("DROP TYPE assettype")
