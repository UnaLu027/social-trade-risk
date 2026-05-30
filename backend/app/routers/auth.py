import re
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.user import RegisterRequest, LoginRequest, LoginResponse, UserProfile
from app.services.auth_service import hash_password, verify_password, create_access_token, decode_access_token

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

# tokenUrl tells Swagger UI where to get a token; actual auth is Bearer-header based
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(raw: str) -> str:
    return raw.strip().lower()


def _validate_email(email: str) -> str:
    email = _normalize_email(email)
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Invalid email format")
    return email


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Dependency: resolves Bearer token → User row, or raises 401."""
    email = decode_access_token(token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.email == email, User.is_active == True).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


@router.post("/register", response_model=UserProfile, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    email = _validate_email(body.email)
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if len(body.password) > 128:
        raise HTTPException(status_code=400, detail="Password must be at most 128 characters")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(email=email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    email = _normalize_email(body.email)
    # Reject out-of-range passwords before Argon2 to prevent hash-DoS on oversized input.
    # Return the generic 401 — we don't reveal which policy check failed.
    if not (8 <= len(body.password) <= 128):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    user = db.query(User).filter(User.email == email, User.is_active == True).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = create_access_token(subject=user.email)
    return LoginResponse(access_token=token, user=UserProfile.model_validate(user))


@router.get("/me", response_model=UserProfile)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
