from fastapi import APIRouter

from api.bank_accounts.endpoints import router as bank_accounts_router
from api.transactions.endpoints import router as transactions_router

router = APIRouter(prefix="/v1")

router.include_router(bank_accounts_router)
router.include_router(transactions_router)
