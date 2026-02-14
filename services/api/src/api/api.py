from fastapi import APIRouter

from api.transactions.endpoints import router as transactions_router

router = APIRouter(prefix="/v1")

router.include_router(transactions_router)
