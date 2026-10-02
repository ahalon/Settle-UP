from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from fastapi import status

from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token
from app.models.base import User, Group, Expense
from app.schemas.expense import (
    UserOut,
    GroupCreate,
    GroupJoin,
    GroupOut,
    ExpenseCreate,
    ExpenseOut,
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
    current_user: models.User = Depends(get_current_user)
):
    expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
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
    num_members = len(members)
    if num_members < 2:
        return {"summary": "Zaproś drugą osobę do lobby, aby widzieć rozliczenia.", "balances": {}}

    expenses = db.query(Expense).filter(Expense.group_id == group_id).all()

    # Inicjalizacja bilansu netto: user_id -> kwota w groszach (dodatnia = nadpłacił, ujemna = jest dłużny)
    net_balances = {m.id: 0 for m in members}

    for exp in expenses:
        share = exp.amount // num_members
        for m in members:
            net_balances[m.id] -= share
        net_balances[exp.payer_id] += exp.amount

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