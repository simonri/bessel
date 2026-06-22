from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from api.models.notification import Notification
from api.notifications.repository import NotificationRepository
from api.notifications.schemas import (
    NotificationCreate,
    NotificationResponse,
    NotificationsListResponse,
)
from api.postgres import AsyncSession, get_db_session

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get(
    "",
    summary="List Notifications",
    response_model=NotificationsListResponse,
)
async def list_notifications(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> NotificationsListResponse:
    repo = NotificationRepository.from_session(session)
    notifications = await repo.list_recent()
    unread_count = sum(1 for n in notifications if n.read_at is None)
    return NotificationsListResponse(
        notifications=[NotificationResponse.model_validate(n) for n in notifications],
        unread_count=unread_count,
    )


@router.post(
    "",
    summary="Create Notification",
    response_model=NotificationResponse,
    status_code=201,
)
async def create_notification(
    body: NotificationCreate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> NotificationResponse:
    repo = NotificationRepository.from_session(session)
    notification = Notification(title=body.title, body=body.body, kind=body.kind)
    session.add(notification)
    await session.flush()
    return NotificationResponse.model_validate(notification)


@router.post(
    "/{notification_id}/read",
    summary="Mark Notification Read",
    response_model=NotificationResponse,
)
async def mark_notification_read(
    notification_id: UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> NotificationResponse:
    repo = NotificationRepository.from_session(session)
    notification = await repo.mark_read(notification_id)
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found.")
    return NotificationResponse.model_validate(notification)


@router.post(
    "/read-all",
    summary="Mark All Notifications Read",
    response_model=dict,
)
async def mark_all_notifications_read(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict:
    repo = NotificationRepository.from_session(session)
    count = await repo.mark_all_read()
    return {"marked_read": count}
