"""replace flat categories with hardcoded hierarchical categories

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-03-08 00:05:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "n4o5p6q7r8s9"
down_revision: str | Sequence[str] | None = "m3n4o5p6q7r8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Parent color -> children inherit the same color
CATEGORIES = [
  # (slug, name, color, excluded, children)
  (
    "revenue",
    "Revenue",
    "#22C55E",
    False,
    [
      ("income", "Income", False),
      ("product-sales", "Product Sales", False),
      ("service-revenue", "Service Revenue", False),
      ("consulting-revenue", "Consulting Revenue", False),
      ("subscription-revenue", "Subscription Revenue", False),
      ("interest-income", "Interest Income", False),
      ("other-income", "Other Income", False),
      ("customer-refunds", "Customer Refunds", False),
      ("chargebacks-disputes", "Chargebacks & Disputes", False),
    ],
  ),
  (
    "cost-of-goods-sold",
    "Cost of Goods Sold",
    "#EF4444",
    False,
    [
      ("inventory", "Inventory", False),
      ("manufacturing", "Manufacturing", False),
      ("shipping-inbound", "Shipping (Inbound)", False),
      ("duties-customs", "Duties & Customs", False),
    ],
  ),
  (
    "sales-marketing",
    "Sales & Marketing",
    "#F59E0B",
    False,
    [
      ("marketing", "Marketing", False),
      ("advertising", "Advertising", False),
      ("website", "Website", False),
      ("events", "Events", False),
      ("promotional-materials", "Promotional Materials", False),
    ],
  ),
  (
    "operations",
    "Operations",
    "#3B82F6",
    False,
    [
      ("office-supplies", "Office Supplies", False),
      ("rent", "Rent", False),
      ("utilities", "Utilities", False),
      ("facilities-expenses", "Facilities Expenses", False),
      ("equipment", "Equipment", False),
      ("internet-and-telephone", "Internet & Telephone", False),
      ("shipping", "Shipping", False),
    ],
  ),
  (
    "professional-services",
    "Professional Services",
    "#8B5CF6",
    False,
    [
      ("professional-services-fees", "Professional Services Fees", False),
      ("contractors", "Contractors", False),
      ("insurance", "Insurance", False),
    ],
  ),
  (
    "human-resources",
    "Human Resources",
    "#EC4899",
    False,
    [
      ("salary", "Salary", False),
      ("training", "Training", False),
      ("benefits", "Benefits", False),
    ],
  ),
  (
    "travel-entertainment",
    "Travel & Entertainment",
    "#14B8A6",
    False,
    [
      ("travel", "Travel", False),
      ("meals", "Meals", False),
      ("activity", "Activity", False),
    ],
  ),
  (
    "technology",
    "Technology",
    "#6366F1",
    False,
    [
      ("software", "Software", False),
      ("non-software-subscriptions", "Non-Software Subscriptions", False),
    ],
  ),
  (
    "banking-finance",
    "Banking & Finance",
    "#64748B",
    False,
    [
      ("transfer", "Transfer", False),
      ("credit-card-payment", "Credit Card Payment", True),
      ("banking-fees", "Banking Fees", False),
      ("loan-proceeds", "Loan Proceeds", False),
      ("loan-principal-repayment", "Loan Principal Repayment", False),
      ("interest-expense", "Interest Expense", False),
      ("payouts", "Payouts", False),
      ("processor-fees", "Processor Fees", False),
      ("fees", "Fees", False),
    ],
  ),
  (
    "assets-capex",
    "Assets",
    "#0EA5E9",
    False,
    [
      ("fixed-assets", "Fixed Assets", False),
      ("prepaid-expenses", "Prepaid Expenses", False),
    ],
  ),
  (
    "liabilities-debt",
    "Liabilities & Debt",
    "#F97316",
    False,
    [
      ("leases", "Leases", False),
      ("deferred-revenue", "Deferred Revenue", False),
    ],
  ),
  (
    "taxes",
    "Taxes & Government",
    "#DC2626",
    False,
    [
      ("vat-gst-pst-qst-payments", "VAT/GST/PST/QST Payments", False),
      ("sales-use-tax-payments", "Sales & Use Tax Payments", False),
      ("income-tax-payments", "Income Tax Payments", False),
      ("payroll-tax-remittances", "Payroll Tax Remittances", False),
      ("employer-taxes", "Employer Taxes", False),
      ("government-fees", "Government Fees", False),
    ],
  ),
  (
    "owner-equity",
    "Owner / Equity",
    "#A855F7",
    False,
    [
      ("owner-draws", "Owner Draws", False),
      ("capital-investment", "Capital Investment", False),
      ("charitable-donations", "Charitable Donations", False),
    ],
  ),
  (
    "system",
    "System",
    "#6B7280",
    False,
    [
      ("uncategorized", "Uncategorized", False),
      ("other", "Other", False),
      ("internal-transfer", "Internal Transfer", True),
    ],
  ),
]


def upgrade() -> None:
  """Upgrade schema."""
  # 1. Nullify all category_id references on transactions
  op.execute(sa.text("UPDATE transactions SET category_id = NULL WHERE category_id IS NOT NULL"))

  # 2. Drop all existing categories
  op.execute(sa.text("DELETE FROM categories"))

  # 3. Drop the unique constraint on name (now we use slug as unique)
  op.drop_constraint("categories_name_key", "categories", type_="unique")

  # 4. Add new columns
  op.add_column("categories", sa.Column("slug", sa.String(100), nullable=True))
  op.add_column("categories", sa.Column("excluded", sa.Boolean(), nullable=False, server_default="false"))
  op.add_column("categories", sa.Column("parent_id", sa.Uuid(), nullable=True))
  op.create_unique_constraint("categories_slug_key", "categories", ["slug"])
  op.create_foreign_key("categories_parent_id_fkey", "categories", "categories", ["parent_id"], ["id"], ondelete="CASCADE")

  # 5. Seed hierarchical categories
  for parent_slug, parent_name, color, parent_excluded, children in CATEGORIES:
    # Insert parent
    op.execute(
      sa.text(
        "INSERT INTO categories (id, slug, name, color, excluded, parent_id, created_at) "
        + "VALUES (gen_random_uuid(), :slug, :name, :color, :excluded, NULL, now())"
      ).bindparams(slug=parent_slug, name=parent_name, color=color, excluded=parent_excluded)
    )
    # Insert children
    for child_slug, child_name, child_excluded in children:
      op.execute(
        sa.text(
          "INSERT INTO categories (id, slug, name, color, excluded, parent_id, created_at) "
          + "VALUES (gen_random_uuid(), :slug, :name, :color, :excluded, (SELECT id FROM categories WHERE slug = :parent_slug), now())"
        ).bindparams(
          slug=child_slug,
          name=child_name,
          color=color,
          excluded=child_excluded,
          parent_slug=parent_slug,
        )
      )

  # 6. Make slug NOT NULL now that all rows have values
  op.alter_column("categories", "slug", nullable=False)


def downgrade() -> None:
  """Downgrade schema."""
  op.execute(sa.text("UPDATE transactions SET category_id = NULL WHERE category_id IS NOT NULL"))
  op.execute(sa.text("DELETE FROM categories"))

  op.drop_constraint("categories_parent_id_fkey", "categories", type_="foreignkey")
  op.drop_constraint("categories_slug_key", "categories", type_="unique")
  op.drop_column("categories", "parent_id")
  op.drop_column("categories", "excluded")
  op.drop_column("categories", "slug")

  op.create_unique_constraint("categories_name_key", "categories", ["name"])

  # Re-seed old flat categories
  old_categories = [
    ("Groceries", "#22C55E"),
    ("Transport", "#3B82F6"),
    ("Salary", "#10B981"),
    ("Dining", "#F59E0B"),
    ("Entertainment", "#8B5CF6"),
    ("Healthcare", "#EF4444"),
    ("Utilities", "#6366F1"),
    ("Shopping", "#EC4899"),
    ("Subscriptions", "#14B8A6"),
    ("Transfers", "#6B7280"),
  ]
  for name, color in old_categories:
    op.execute(
      sa.text("INSERT INTO categories (id, name, color, created_at) VALUES (gen_random_uuid(), :name, :color, now())").bindparams(name=name, color=color)
    )
