from fastapi import APIRouter

from api.bank_accounts.endpoints import router as bank_accounts_router
from api.categories.endpoints import router as categories_router
from api.investments.endpoints import router as investments_router
from api.journal.endpoints import router as journal_router
from api.places.endpoints import router as places_router
from api.tasks.endpoints import router as tasks_router
from api.transactions.endpoints import router as transactions_router

router = APIRouter(prefix="/v1")

router.include_router(bank_accounts_router)
router.include_router(categories_router)
router.include_router(investments_router)
router.include_router(journal_router)
router.include_router(places_router)
router.include_router(tasks_router)
router.include_router(transactions_router)
