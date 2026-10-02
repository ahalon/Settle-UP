from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ==========================================
# --- USER SCHEMAS ---
# ==========================================

class UserBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=50, description="Imię lub nick użytkownika")
    email: EmailStr = Field(..., max_length=100, description="Poprawny adres e-mail")


class UserCreate(UserBase):
    """Schemat rejestracji: wymaga hasła z minimalną długością."""
    password: str = Field(..., min_length=8, max_length=128, description="Hasło użytkownika")


class UserLogin(BaseModel):
    """Schemat logowania JSON."""
    email: EmailStr
    password: str = Field(..., min_length=1)


class UserOut(UserBase):
    """Schemat wyjściowy: NIE zawiera hasła."""
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# --- GROUP SCHEMAS ---
# ==========================================

class GroupCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Nazwa lobby/grupy")


class GroupJoin(BaseModel):
    join_code: str = Field(..., min_length=4, max_length=10, description="Unikalny kod dołączenia")


class GroupOut(BaseModel):
    id: int
    name: str
    join_code: str
    created_at: datetime
    members: List[UserOut] = []

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# --- EXPENSE SCHEMAS ---
# ==========================================

class ExpenseCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100, description="Tytuł wydatku")
    amount: int = Field(..., gt=0, description="Kwota w groszach/centach (musi być > 0)")
    payer_id: int = Field(..., gt=0, description="ID użytkownika płacącego")
    group_id: int = Field(..., gt=0, description="ID grupy/lobby")
    description: Optional[str] = Field(None, max_length=255)
    receipt_image: Optional[str] = None


class ExpenseOut(ExpenseCreate):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)