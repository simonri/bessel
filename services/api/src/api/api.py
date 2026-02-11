from fastapi import APIRouter

from api.auth.endpoints import router as auth_router
from api.users.endpoints import router as users_router

router = APIRouter(prefix="/v1")

router.include_router(auth_router)
router.include_router(users_router)
