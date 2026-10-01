from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.base import User, Expense, Settlement
from app.schemas.expense import (
    UserCreate,
    UserResponse,
    ExpenseCreate,
    ExpenseResponse,
    SettlementCreate,
    BalanceResponse,
)

router = APIRouter()


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user = User(name=payload.name, email=payload.email)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/expenses", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_expense(payload: ExpenseCreate, db: Session = Depends(get_db)):
    payer = db.query(User).filter(User.id == payload.payer_id).first()
    if not payer:
        raise HTTPException(status_code=404, detail="Payer not found")

    expense = Expense(
        title=payload.title,
        amount=payload.amount,
        payer_id=payload.payer_id,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.get("/expenses", response_model=List[ExpenseResponse])
def get_expenses(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    return db.query(Expense).order_by(Expense.created_at.desc()).offset(skip).limit(limit).all()


@router.post("/settle", status_code=status.HTTP_201_CREATED)
def settle_balance(payload: SettlementCreate, db: Session = Depends(get_db)):
    settlement = Settlement(
        payer_id=payload.payer_id,
        receiver_id=payload.receiver_id,
        amount=payload.amount,
    )
    db.add(settlement)
    db.commit()
    return {"status": "success", "message": "Settlement recorded"}


@router.get("/balance", response_model=BalanceResponse)
def get_balance(user_a_id: int, user_b_id: int, db: Session = Depends(get_db)):
    user_a = db.query(User).filter(User.id == user_a_id).first()
    user_b = db.query(User).filter(User.id == user_b_id).first()

    if not user_a or not user_b:
        raise HTTPException(status_code=404, detail="One or both users not found")

    # 1. Total expenses paid by each user
    spent_a = db.query(func.coalesce(func.sum(Expense.amount), 0)).filter(Expense.payer_id == user_a_id).scalar()
    spent_b = db.query(func.coalesce(func.sum(Expense.amount), 0)).filter(Expense.payer_id == user_b_id).scalar()

    # 2. Total direct settlements between them
    settled_a_to_b = db.query(func.coalesce(func.sum(Settlement.amount), 0)).filter(
        Settlement.payer_id == user_a_id, Settlement.receiver_id == user_b_id
    ).scalar()

    settled_b_to_a = db.query(func.coalesce(func.sum(Settlement.amount), 0)).filter(
        Settlement.payer_id == user_b_id, Settlement.receiver_id == user_a_id
    ).scalar()

    # Mathematical formulation for two-person 50/50 split:
    # Net balance > 0 means User B owes User A.
    # Net balance < 0 means User A owes User B.
    net = ((spent_a - spent_b) // 2) - settled_b_to_a + settled_a_to_b

    if net > 0:
        summary = f"{user_b.name} owes {user_a.name} {net / 100:.2f} PLN"
    elif net < 0:
        summary = f"{user_a.name} owes {user_b.name} {abs(net) / 100:.2f} PLN"
    else:
        summary = "All settled up! Balance is zero."

    return BalanceResponse(
        user_a_id=user_a_id,
        user_b_id=user_b_id,
        net_balance=net,
        summary=summary,
    )