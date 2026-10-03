from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.base import Expense, Group, Transfer, User
from app.schemas import BalanceOut, MonthlySummaryOut

router = APIRouter()


def calculate_group_balances(
    group: Group,
    db: Session,
    as_of: datetime | None = None,
) -> dict[int, int]:
    members = group.members
    num_members = len(members)
    net_balances = {member.id: 0 for member in members}

    if num_members == 0:
        return net_balances

    expense_query = db.query(Expense).filter(Expense.group_id == group.id)
    if as_of is not None:
        expense_query = expense_query.filter(Expense.created_at <= as_of)
    expenses = expense_query.all()
    for expense in expenses:
        share = expense.amount // num_members
        for member in members:
            net_balances[member.id] -= share
        net_balances[expense.payer_id] += expense.amount

    transfer_query = db.query(Transfer).filter(
        Transfer.group_id == group.id,
        Transfer.status != "rejected",
    )
    if as_of is not None:
        transfer_query = transfer_query.filter(Transfer.created_at <= as_of)
    active_transfers = transfer_query.all()
    for transfer in active_transfers:
        net_balances[transfer.sender_id] += transfer.amount
        net_balances[transfer.receiver_id] -= transfer.amount

    return net_balances


@router.get("/groups/{group_id}/balance", response_model=BalanceOut)
def get_group_balance(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group or current_user not in group.members:
        raise HTTPException(status_code=403, detail="Brak dostępu do tej grupy.")

    members = group.members
    if len(members) < 2:
        return {"summary": "Zaproś drugą osobę do lobby, aby widzieć rozliczenia.", "balances": {}}

    net_balances = calculate_group_balances(group, db)

    my_balance_cents = net_balances.get(current_user.id, 0)
    my_balance_pln = my_balance_cents / 100

    if my_balance_pln > 0:
        summary = f"Grupa jest Ci winna: {my_balance_pln:.2f} PLN"
    elif my_balance_pln < 0:
        summary = f"Jesteś winny grupie: {abs(my_balance_pln):.2f} PLN"
    else:
        summary = "Wszystko rozliczone na czysto (0.00 PLN)"

    return {
        "summary": summary,
        "my_net_balance": my_balance_cents,
        "all_balances": net_balances,
    }


@router.get("/groups/{group_id}/monthly-summary", response_model=MonthlySummaryOut)
def get_group_monthly_summary(
    group_id: int,
    year: int = Query(..., ge=2020, le=2100, description="Rok podsumowania"),
    month: int = Query(..., ge=1, le=12, description="Miesiąc podsumowania (1-12)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group or current_user not in group.members:
        raise HTTPException(status_code=403, detail="Brak dostępu do tej grupy.")

    # Pobieramy wydatki tylko z wybranego miesiąca i roku
    monthly_expenses = (
        db.query(Expense)
        .filter(
            Expense.group_id == group_id,
            extract("year", Expense.created_at) == year,
            extract("month", Expense.created_at) == month,
        )
        .all()
    )

    total_group_spent = sum(e.amount for e in monthly_expenses)

    # Inicjalizacja wydatków per user na 0 dla każdego członka grupy
    spending_by_user = {member.id: {"name": member.name, "amount": 0} for member in group.members}

    for exp in monthly_expenses:
        if exp.payer_id in spending_by_user:
            spending_by_user[exp.payer_id]["amount"] += exp.amount

    my_spent = spending_by_user.get(current_user.id, {}).get("amount", 0)

    return {
        "year": year,
        "month": month,
        "total_group_spent": total_group_spent,
        "total_group_spent_pln": f"{total_group_spent / 100:.2f} PLN",
        "my_spent": my_spent,
        "my_spent_pln": f"{my_spent / 100:.2f} PLN",
        "expense_count": len(monthly_expenses),
        "members_breakdown": list(spending_by_user.values()),
    }