from datetime import datetime
from pydantic import BaseModel


class RegisterRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UserProfile(BaseModel):
    id: int
    email: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile


class PersonalWatchlistItem(BaseModel):
    symbol: str
    is_active: bool
    created_at: datetime
    removed_at: datetime | None = None

    model_config = {"from_attributes": True}


class AddToWatchlistRequest(BaseModel):
    symbol: str
