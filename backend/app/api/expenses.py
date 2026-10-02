from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.base import Expense, Group, User
from app.schemas import ExpenseCreate, ExpenseOut

router = APIRouter()


@router.post("/expenses", response_model=ExpenseOut)
def add_expense(
    payload: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == payload.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Grupa nie istnieje.")

    if current_user not in group.members:
        raise HTTPException(status_code=403, detail="Nie masz dostępu do tej grupy.")

    expense = Expense(
        title=payload.title,
        amount=payload.amount,
        payer_id=payload.payer_id,
        group_id=payload.group_id,
        description=payload.description,
        receipt_image=payload.receipt_image,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.get("/groups/{group_id}/expenses", response_model=List[ExpenseOut])
def get_group_expenses(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group or current_user not in group.members:
        raise HTTPException(status_code=403, detail="Brak dostępu do wydatków tej grupy.")

    return db.query(Expense).filter(Expense.group_id == group_id).order_by(Expense.created_at.desc()).all()


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Wydatek nie istnieje")

    if expense.payer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Możesz usuwać tylko własne wydatki"
        )

    db.delete(expense)
    db.commit()
    return None