from datetime import date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query

from api.models.user import User
from api.postgres import DBSession
from api.recurring import service
from api.recurring.repository import RecurringSeriesRepository
from api.recurring.schemas import RecurringResponse, RecurringReviewCreate, RecurringReviewSchema, RecurringReviewUpdate
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/recurring", tags=["recurring"])


def _today(user: User) -> date:
  return datetime.now(ZoneInfo(user.timezone or "UTC")).date()


@router.get("", summary="List Recurring Payments", response_model=RecurringResponse)
async def list_recurring_payments(
  session: DBSession,
  current_user: CurrentDBUser,
  days: int = Query(default=30, ge=1, le=366, description="How many days ahead, from today, upcoming payments cover."),
) -> RecurringResponse:
  """Bills, subscriptions and income that repeat, detected from the transactions, with what's due next."""
  return await service.overview(session, current_user.id, today=_today(current_user), days=days)


@router.post("/reviews", summary="Review Recurring Series", response_model=RecurringReviewSchema, status_code=201)
async def create_recurring_review(body: RecurringReviewCreate, session: DBSession, current_user: CurrentDBUser) -> RecurringReviewSchema:
  """Confirms, dismisses, renames or changes the kind of a detected series, found by its key and typical amount."""
  review = await RecurringSeriesRepository.from_session(session).upsert(
    current_user.id, key=body.key, typical_amount=body.typical_amount, changes=body.model_dump(exclude={"key", "typical_amount"}, exclude_unset=True)
  )
  return RecurringReviewSchema.model_validate(review)


@router.patch("/reviews/{review_id}", summary="Update Recurring Review", response_model=RecurringReviewSchema)
async def update_recurring_review(review_id: UUID, body: RecurringReviewUpdate, session: DBSession, current_user: CurrentDBUser) -> RecurringReviewSchema:
  repository = RecurringSeriesRepository.from_session(session)
  review = await repository.get_owned_or_404(review_id, current_user.id, not_found_message="Review not found.")
  review = await repository.update(review, update_dict=body.model_dump(exclude_unset=True), flush=True)
  return RecurringReviewSchema.model_validate(review)


@router.delete("/reviews/{review_id}", summary="Delete Recurring Review", status_code=204)
async def delete_recurring_review(review_id: UUID, session: DBSession, current_user: CurrentDBUser) -> None:
  """Back to the series as detected."""
  repository = RecurringSeriesRepository.from_session(session)
  await repository.delete(await repository.get_owned_or_404(review_id, current_user.id, not_found_message="Review not found."), flush=True)
