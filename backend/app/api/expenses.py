from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import extract
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

    if not any(member.id == payload.payer_id for member in group.members):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Wskazany płatnik nie należy do tej grupy.",
        )

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
    year: Optional[int] = Query(None, ge=2020, le=2100, description="Filtruj po roku"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Filtruj po miesiącu (1-12)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group or current_user not in group.members:
        raise HTTPException(status_code=403, detail="Brak dostępu do wydatków tej grupy.")

    query = db.query(Expense).filter(Expense.group_id == group_id)

    # Filtrowanie miesięczne, gdy oba parametry zostaną przekazane
    if year is not None and month is not None:
        query = query.filter(
            extract("year", Expense.created_at) == year,
            extract("month", Expense.created_at) == month,
        )

    return query.order_by(Expense.created_at.desc()).all()


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Wydatek nie istnieje")

    if expense.payer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Możesz usuwać tylko własne wydatki",
        )

    db.delete(expense)
    db.commit()
    return None