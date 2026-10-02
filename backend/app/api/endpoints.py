from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from fastapi import status

from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token
from app.models.base import User, Group, Expense, Transfer
from app.schemas import (
    UserOut,
    GroupCreate,
    GroupJoin,
    GroupOut,
    ExpenseCreate,
    ExpenseOut,
    TransferCreate,
    TransferOut,
)
from pydantic import BaseModel, EmailStr
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from app.core.config import settings

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# --- AUTH SCHEMAS & HELPERS ---
class RegisterPayload(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    name: str


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Nieprawidłowy token uwierzytelniający",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id_str = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        user_id = int(user_id_str)
    except (JWTError, ValueError):
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user


# --- AUTH ENDPOINTS ---
@router.post("/auth/register", response_model=TokenResponse)
def register(payload: RegisterPayload, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Użytkownik o takim emailu już istnieje.")

    user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer", "user_id": user.id, "name": user.name}


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Błędny email lub hasło.")

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer", "user_id": user.id, "name": user.name}


# --- GROUP (LOBBY) ENDPOINTS ---
@router.post("/groups", response_model=GroupOut)
def create_group(
    payload: GroupCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = Group(name=payload.name)
    group.members.append(current_user)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.post("/groups/join", response_model=GroupOut)
def join_group(
    payload: GroupJoin,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.join_code == payload.join_code.strip().upper()).first()
    if not group:
        raise HTTPException(status_code=404, detail="Nie znaleziono grupy o takim kodzie.")

    if current_user in group.members:
        raise HTTPException(status_code=400, detail="Już należysz do tej grupy.")

    group.members.append(current_user)
    db.commit()
    db.refresh(group)
    return group


@router.get("/groups/my", response_model=List[GroupOut])
def get_my_groups(current_user: User = Depends(get_current_user)):
    return current_user.groups


# --- EXPENSE ENDPOINTS PER GROUP ---
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


def calculate_group_balances(group: Group, db: Session) -> dict[int, int]:
    members = group.members
    num_members = len(members)
    net_balances = {member.id: 0 for member in members}

    if num_members == 0:
        return net_balances

    expenses = db.query(Expense).filter(Expense.group_id == group.id).all()
    for expense in expenses:
        share = expense.amount // num_members
        for member in members:
            net_balances[member.id] -= share
        net_balances[expense.payer_id] += expense.amount

    active_transfers = (
        db.query(Transfer)
        .filter(Transfer.group_id == group.id, Transfer.status != "rejected")
        .all()
    )
    for transfer in active_transfers:
        net_balances[transfer.sender_id] += transfer.amount
        net_balances[transfer.receiver_id] -= transfer.amount

    return net_balances


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


# --- BALANCE CALCULATION PER GROUP ---
@router.get("/groups/{group_id}/balance")
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