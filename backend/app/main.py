from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine
from app.models.base import Base
from app.api.router import router as api_router

# Automatyczne utworzenie wszystkich tabel zdefiniowanych w Base (users, groups, group_members, expenses)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="SettleUp API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/")
def root():
    return {"message": "SettleUp API działa"}