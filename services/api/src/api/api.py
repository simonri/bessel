from fastapi import APIRouter

from api.activity.endpoints import router as activity_router
from api.bank_accounts.endpoints import router as bank_accounts_router
from api.categories.endpoints import router as categories_router
from api.counters.endpoints import router as counters_router
from api.investments.endpoints import router as investments_router
from api.klarna.endpoints import router as klarna_router
from api.notifications.endpoints import router as notifications_router
from api.places.endpoints import router as places_router
from api.recipes.endpoints import router as recipes_router
from api.tasks.endpoints import router as tasks_router
from api.transactions.endpoints import router as transactions_router
from api.weather.endpoints import router as weather_router

router = APIRouter(prefix="/v1")

router.include_router(activity_router)
router.include_router(bank_accounts_router)
router.include_router(categories_router)
router.include_router(counters_router)
router.include_router(investments_router)
router.include_router(notifications_router)
router.include_router(places_router)
router.include_router(recipes_router)
router.include_router(tasks_router)
router.include_router(transactions_router)
router.include_router(weather_router)
router.include_router(klarna_router)
