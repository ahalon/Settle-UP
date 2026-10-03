from calendar import monthrange
from datetime import datetime, time, timezone
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.balance import calculate_group_balances
from app.core.database import get_db
from app.models.base import Group, Notification, User
from app.schemas import NotificationOut

router = APIRouter()


def previous_month(now: datetime | None = None) -> tuple[int, int]:
    current = now or datetime.now(timezone.utc)
    if current.month == 1:
        return current.year - 1, 12
    return current.year, current.month - 1


def generate_monthly_notifications(
    db: Session,
    year: int | None = None,
    month: int | None = None,
) -> int:
    if year is None or month is None:
        year, month = previous_month()

    cutoff = datetime(
        year,
        month,
        monthrange(year, month)[1],
        23,
        59,
        59,
        tzinfo=timezone.utc,
    )

    created = 0
    for group in db.query(Group).all():
        balances = calculate_group_balances(group, db, as_of=cutoff)
        for member in group.members:
            balance_cents = balances.get(member.id, 0)
            if balance_cents == 0:
                continue

            existing = (
                db.query(Notification)
                .filter(
                    Notification.user_id == member.id,
                    Notification.group_id == group.id,
                    Notification.year == year,
                    Notification.month == month,
                )
                .first()
            )
            if existing:
                continue

            amount = abs(balance_cents) / 100
            if balance_cents < 0:
                message = (
                    f"Podsumowanie miesiąca: Jesteś winny grupie {amount:.2f} PLN. "
                    "Kliknij, aby uregulować rachunki."
                )
            else:
                message = (
                    f"Podsumowanie miesiąca: Członkowie grupy wiszą Ci łącznie "
                    f"{amount:.2f} PLN."
                )

            db.add(Notification(
                user_id=member.id,
                group_id=group.id,
                year=year,
                month=month,
                message=message,
            ))
            created += 1

    if created:
        db.commit()
    return created


@router.get("/notifications", response_model=List[NotificationOut])
def get_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .all()
    )
