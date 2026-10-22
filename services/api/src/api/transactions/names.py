"""What the user calls a transaction, kept apart from the bank's own text."""

import re
from uuid import UUID

from api.models.transaction import Transaction
from api.models.transaction_name_rule import TransactionNameRule
from api.postgres import AsyncSession
from api.transactions.repository import TransactionNameRuleRepository, TransactionRepository
from api.transactions.schemas import NameSuggestion

# Shorter words, like "AB" or "SE", and these common ones match far too much bank text to be worth suggesting.
MIN_SUGGESTION_WORD = 3
IGNORED_WORDS = frozenset({"and", "the", "for", "från", "för", "med", "och", "till", "with"})
MAX_SUGGESTIONS = 5


async def rename(session: AsyncSession, transaction: Transaction, name: str | None) -> list[NameSuggestion]:
  """Names this transaction only, and suggests others that likely want the same name."""
  if name == transaction.description:
    name = None
  repository = TransactionRepository.from_session(session)
  previous = transaction.name
  await repository.update(transaction, update_dict={"name": name, "name_rule_id": None}, flush=True)
  if name is None or not transaction.description:
    return []

  suggestions = []
  rule = await TransactionNameRuleRepository.from_session(session).get_for_description(transaction.user_id, transaction.description)
  same = await repository.count_to_rename(transaction.user_id, description=transaction.description, name=name, adopt=[rule.name] if rule else [])
  if same:
    suggestions.append(NameSuggestion(description=transaction.description, count=same))
  words = [word for word in re.findall(r"\w+", name.casefold()) if len(word) >= MIN_SUGGESTION_WORD and word not in IGNORED_WORDS]
  for description, count in await repository.descriptions_to_suggest(
    transaction.user_id,
    words=words,
    named=[previous] if previous and previous != name else [],
    exclude=transaction.description,
    limit=MAX_SUGGESTIONS,
  ):
    suggestions.append(NameSuggestion(description=description, count=count))
  return suggestions


async def name_all(session: AsyncSession, user_id: UUID, *, description: str, name: str) -> int:
  """Names every transaction with this bank text, now and in later imports; returns how many it named."""
  rules = TransactionNameRuleRepository.from_session(session)
  rule = await rules.get_for_description(user_id, description)
  if rule is None:
    previous = None
    rule = await rules.create(TransactionNameRule(user_id=user_id, description=description, name=name), flush=True)
  else:
    previous = rule.name
    await rules.update(rule, update_dict={"name": name})
  return await TransactionRepository.from_session(session).name_by_rule(rule, adopt=[n for n in (name, previous) if n])


async def names_for_import(session: AsyncSession, user_id: UUID) -> dict[str, TransactionNameRule]:
  return await TransactionNameRuleRepository.from_session(session).by_description(user_id)
