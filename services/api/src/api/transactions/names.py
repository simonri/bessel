"""What the user calls a transaction, kept apart from the bank's own text."""

import re
from uuid import UUID

from api.models.transaction import Transaction
from api.models.transaction_name_rule import TransactionNameRule
from api.postgres import AsyncSession
from api.transactions.repository import TransactionNameRuleRepository, TransactionRepository
from api.transactions.schemas import NameSuggestion

# Shorter words, like "AB" or "SE", match far too much bank text to be worth suggesting.
MIN_SUGGESTION_WORD = 3
MAX_SUGGESTIONS = 5


async def rename(session: AsyncSession, transaction: Transaction, name: str | None) -> list[NameSuggestion]:
  """Names this transaction only, and suggests others that likely want the same name."""
  repository = TransactionRepository.from_session(session)
  await repository.update(transaction, update_dict={"name": name, "name_rule_id": None}, flush=True)
  if name is None or not transaction.description:
    return []

  suggestions = []
  same = await repository.count_to_rename(transaction.user_id, description=transaction.description, name=name)
  if same:
    suggestions.append(NameSuggestion(description=transaction.description, count=same))
  words = [word for word in re.findall(r"\w+", name) if len(word) >= MIN_SUGGESTION_WORD]
  for description, count in await repository.unnamed_descriptions_containing(
    transaction.user_id, words, exclude=transaction.description, limit=MAX_SUGGESTIONS
  ):
    suggestions.append(NameSuggestion(description=description, count=count))
  return suggestions


async def name_all(session: AsyncSession, user_id: UUID, *, description: str, name: str) -> int:
  """Names every transaction with this bank text, now and in later imports; returns how many it named."""
  rules = TransactionNameRuleRepository.from_session(session)
  rule = await rules.get_for_description(user_id, description)
  if rule is None:
    rule = await rules.create(TransactionNameRule(user_id=user_id, description=description, name=name), flush=True)
  else:
    await rules.update(rule, update_dict={"name": name})
  return await TransactionRepository.from_session(session).name_by_rule(rule)


async def names_for_import(session: AsyncSession, user_id: UUID) -> dict[str, TransactionNameRule]:
  return await TransactionNameRuleRepository.from_session(session).by_description(user_id)
