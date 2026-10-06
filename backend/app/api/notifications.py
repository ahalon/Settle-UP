from calendar import monthrange
from datetime import datetime, time, timezone
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, send_expo_push
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
    notifications_to_push: list[tuple[str, str, str, dict]] = []

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
                body = f"Jesteś winny grupie {amount:.2f} PLN. Ureguluj rachunki."
                message = (
                    f"Podsumowanie miesiąca ({group.name}): Jesteś winny grupie {amount:.2f} PLN. "
                    "Kliknij, aby uregulować rachunki."
                )
            else:
                body = f"Członkowie grupy wiszą Ci łącznie {amount:.2f} PLN."
                message = (
                    f"Podsumowanie miesiąca ({group.name}): Członkowie grupy wiszą Ci łącznie "
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

            if member.expo_push_token:
                notifications_to_push.append((
                    member.expo_push_token,
                    f"Podsumowanie miesiąca: {group.name}",
                    body,
                    {
                        "type": "monthly_summary",
                        "group_id": group.id,
                        "year": year,
                        "month": month,
                    },
                ))

    if created:
        db.commit()
        # Wysyłka pushy po udanym zapisie do bazy
        for token, title, body, data in notifications_to_push:
            send_expo_push(token=token, title=title, body=body, data=data)

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


@router.post("/notifications/trigger-monthly-summary")
def trigger_monthly_summary(
    background_tasks: BackgroundTasks,
    year: int | None = Query(None, description="Rok podsumowania (np. 2026)"),
    month: int | None = Query(None, description="Miesiąc podsumowania (1-12)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Ręczne wywołanie generowania podsumowań (testy lub ręczny cron)."""
    background_tasks.add_task(generate_monthly_notifications, db, year, month)
    return {
        "status": "ok",
        "message": f"Uruchomiono generowanie powiadomień za {month or 'poprzedni'}/{year or 'rok'} w tle.",
    }


@router.patch("/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_notification_as_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Oznacza powiadomienie jako przeczytane."""
    notif = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Powiadomienie nie istnieje.")
    if notif.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Brak uprawnień.")

    notif.read_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(notif)
    return notif