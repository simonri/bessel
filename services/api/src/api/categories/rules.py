"""Categorizes transactions by their description, so imports arrive sorted."""

from collections.abc import Sequence
from datetime import date
from typing import Protocol
from uuid import UUID

from api.categories.repository import CategoryRuleRepository
from api.models.category_rule import CategoryRule, RuleScope
from api.models.transaction import TransactionDirection
from api.postgres import AsyncSession
from api.transactions.repository import TransactionRepository


class RuleTarget(Protocol):
  @property
  def description(self) -> str | None: ...
  @property
  def direction(self) -> TransactionDirection: ...
  @property
  def company_account(self) -> bool: ...


def fits(rule: CategoryRule, candidate: RuleTarget) -> bool:
  if rule.pattern.casefold() not in (candidate.description or "").casefold():
    return False
  if rule.direction is not None and rule.direction != candidate.direction:
    return False
  if rule.scope == RuleScope.company:
    return candidate.company_account
  if rule.scope == RuleScope.private:
    return not candidate.company_account
  return True


def best_rule(rules: Sequence[CategoryRule], candidate: RuleTarget) -> CategoryRule | None:
  """The most specific rule that fits: one aimed at the account's owner or a direction beats a general one,
  then the longest text wins, so "F-skatt + moms" goes to tax rather than VAT."""
  fitting = [rule for rule in rules if fits(rule, candidate)]
  return max(
    fitting,
    key=lambda rule: (rule.scope != RuleScope.any, rule.direction is not None, len(rule.pattern), rule.pattern),
    default=None,
  )


async def categorize(
  session: AsyncSession,
  user_id: UUID,
  *,
  since: date | None = None,
  only_rule: CategoryRule | None = None,
  transaction_ids: Sequence[UUID] | None = None,
) -> int:
  """Sorts the user's uncategorized transactions by their rules; returns how many it categorized.

  With `only_rule`, sorts just those that rule wins, leaving the ones other rules would take as they are."""
  rules = await CategoryRuleRepository.from_session(session).list_for_user(user_id)
  if not rules:
    return 0
  transactions = TransactionRepository.from_session(session)
  matched = 0
  for candidate in await transactions.rule_candidates(user_id, since=since, ids=transaction_ids):
    rule = best_rule(rules, candidate)
    if rule is None or (only_rule is not None and rule.id != only_rule.id):
      continue
    await transactions.set_category_from_rule(candidate.id, rule.category_id, rule_id=rule.id, mark_business=rule.mark_business)
    matched += 1
  return matched
