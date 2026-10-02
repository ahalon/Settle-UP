from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.balance import calculate_group_balances
from app.core.database import get_db
from app.models.base import Group, Transfer, User
from app.schemas import TransferCreate, TransferOut

router = APIRouter()


@router.post("/groups/{group_id}/transfers", response_model=TransferOut)
def declare_transfer(
    group_id: int,
    payload: TransferCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group or current_user not in group.members:
        raise HTTPException(status_code=403, detail="Brak dostępu do tej grupy.")

    receiver = db.query(User).filter(User.id == payload.receiver_id).first()
    if not receiver or receiver not in group.members or receiver.id == current_user.id:
        raise HTTPException(status_code=400, detail="Nieprawidłowy odbiorca przelewu.")

    balances = calculate_group_balances(group, db)
    sender_balance = balances.get(current_user.id, 0)
    receiver_balance = balances.get(receiver.id, 0)
    if sender_balance >= 0:
        raise HTTPException(status_code=400, detail="Nie masz ujemnego salda do spłaty.")
    if receiver_balance <= 0:
        raise HTTPException(status_code=400, detail="Wybrany użytkownik nie ma dodatniego salda.")

    available_to_send = -sender_balance
    available_for_receiver = receiver_balance
    if payload.amount > available_to_send:
        raise HTTPException(status_code=400, detail="Kwota przekracza Twój pozostały dług.")
    if payload.amount > available_for_receiver:
        raise HTTPException(status_code=400, detail="Kwota przekracza należność odbiorcy.")

    transfer = Transfer(
        group_id=group_id,
        sender_id=current_user.id,
        receiver_id=receiver.id,
        amount=payload.amount,
        status="pending",
    )
    db.add(transfer)
    db.commit()
    db.refresh(transfer)
    return transfer


@router.get("/groups/{group_id}/transfers", response_model=List[TransferOut])
def get_group_transfers(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group or current_user not in group.members:
        raise HTTPException(status_code=403, detail="Brak dostępu do tej grupy.")

    return (
        db.query(Transfer)
        .filter(Transfer.group_id == group_id)
        .order_by(Transfer.created_at.desc())
        .all()
    )


def update_transfer_status(
    transfer_id: int,
    new_status: str,
    current_user: User,
    db: Session,
):
    transfer = db.query(Transfer).filter(Transfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Przelew nie istnieje.")
    if transfer.receiver_id != current_user.id:
        raise HTTPException(status_code=403, detail="Tylko odbiorca może zmienić status przelewu.")
    if transfer.status != "pending":
        raise HTTPException(status_code=400, detail="Ten przelew został już rozpatrzony.")

    transfer.status = new_status
    db.commit()
    db.refresh(transfer)
    return transfer


@router.post("/transfers/{transfer_id}/confirm", response_model=TransferOut)
def confirm_transfer(
    transfer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return update_transfer_status(transfer_id, "confirmed", current_user, db)


@router.post("/transfers/{transfer_id}/reject", response_model=TransferOut)
def reject_transfer(
    transfer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return update_transfer_status(transfer_id, "rejected", current_user, db)


@router.delete("/transfers/{transfer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transfer(
    transfer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    transfer = db.query(Transfer).filter(Transfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Przelew nie istnieje.")
    if transfer.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Możesz usuwać tylko własne deklaracje.")
    if transfer.status != "pending":
        raise HTTPException(status_code=400, detail="Można usuwać tylko oczekujące deklaracje.")

    db.delete(transfer)
    db.commit()
    return None