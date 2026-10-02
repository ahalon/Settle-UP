from fastapi import APIRouter

from app.api import auth, balance, expenses, groups, transfers

router = APIRouter()
router.include_router(auth.router)
router.include_router(groups.router)
router.include_router(expenses.router)
router.include_router(transfers.router)
router.include_router(balance.router)