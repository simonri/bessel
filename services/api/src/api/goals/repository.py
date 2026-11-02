from collections.abc import Sequence
from datetime import date
from uuid import UUID

from sqlalchemy import select

from api.common.repository.base import RepositoryBase, RepositoryIDMixin, RepositoryUserMixin
from api.models.contact import Contact, ContactInteraction, ContactInteractionKind
from api.models.goal import Goal, GoalCheckin


class GoalRepository(RepositoryBase[Goal], RepositoryIDMixin[Goal, UUID], RepositoryUserMixin[Goal]):
  model = Goal

  async def list_for_user(self, user_id: UUID) -> Sequence[Goal]:
    return await super().list_for_user(user_id, order_by=Goal.position)


class GoalCheckinRepository(RepositoryBase[GoalCheckin], RepositoryIDMixin[GoalCheckin, UUID]):
  model = GoalCheckin

  async def list_since(self, user_id: UUID, goal_ids: Sequence[UUID], since: date) -> Sequence[GoalCheckin]:
    if not goal_ids:
      return []
    statement = self.get_base_statement().where(
      GoalCheckin.user_id == user_id, GoalCheckin.goal_id.in_(goal_ids), GoalCheckin.day >= since, GoalCheckin.deleted_at.is_(None)
    )
    return await self.get_all(statement)

  async def met_since(self, user_id: UUID, since: date) -> list[tuple[date, list[str]]]:
    """Days the user met someone, from the contacts' interaction log, with that contact's tags."""
    statement = (
      select(ContactInteraction.occurred_on, Contact.tags)
      .join(Contact, Contact.id == ContactInteraction.contact_id)
      .where(
        ContactInteraction.user_id == user_id,
        Contact.user_id == user_id,
        ContactInteraction.kind == ContactInteractionKind.met,
        ContactInteraction.occurred_on >= since,
        ContactInteraction.deleted_at.is_(None),
        Contact.deleted_at.is_(None),
      )
    )
    return [(day, list(tags or [])) for day, tags in (await self.session.execute(statement)).all()]
