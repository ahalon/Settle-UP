from datetime import datetime
from pydantic import BaseModel, Field


class UserBase(BaseModel):
    name: str
    email: str


class UserCreate(UserBase):
    pass


class UserResponse(UserBase):
    id: int

    class Config:
        from_attributes = True


class ExpenseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    amount: int = Field(gt=0, description="Amount in cents/grosze")
    payer_id: int


class ExpenseResponse(BaseModel):
    id: int
    title: str
    amount: int
    payer_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class SettlementCreate(BaseModel):
    payer_id: int
    receiver_id: int
    amount: int = Field(gt=0)


class BalanceResponse(BaseModel):
    user_a_id: int
    user_b_id: int
    net_balance: int  # Positive: user_b owes user_a. Negative: user_a owes user_b.
    summary: str