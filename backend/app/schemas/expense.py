from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


# --- USER SCHEMAS ---
class UserBase(BaseModel):
    name: str = Field(..., max_length=50)
    email: str = Field(..., max_length=100)


class UserOut(UserBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# --- GROUP SCHEMAS ---
class GroupCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)


class GroupJoin(BaseModel):
    join_code: str = Field(..., min_length=4, max_length=10)


class GroupOut(BaseModel):
    id: int
    name: str
    join_code: str
    created_at: datetime
    members: List[UserOut] = []
    model_config = ConfigDict(from_attributes=True)


# --- EXPENSE SCHEMAS ---
class ExpenseCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    amount: int = Field(..., gt=0)
    payer_id: int
    group_id: int


class ExpenseOut(BaseModel):
    id: int
    title: str
    amount: int
    payer_id: int
    group_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)