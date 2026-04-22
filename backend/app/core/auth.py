from backend.app.core.shared_imports import (
    CryptContext,
    Depends,
    HTTPAuthorizationCredentials,
    HTTPBearer,
    HTTPException,
    JWTError,
    Optional,
    Session,
    datetime,
    get_database_symbols,
    get_settings_symbol,
    jwt,
    timedelta,
)

settings = get_settings_symbol()
get_db, User, _, _, _, _, _, _, _, _ = get_database_symbols()

SECRET_KEY = settings.jwt_secret
ALGORITHM = settings.jwt_algorithm
ACCESS_TOKEN_EXPIRE_HOURS = settings.jwt_expire_hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def create_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.username == payload.get("sub")).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def require_permission(perm: str):
    def checker(user: User = Depends(get_current_user)):
        if user.role == "admin":
            return user
        if not getattr(user, perm, False):
            raise HTTPException(status_code=403, detail=f"Permission denied: {perm}")
        return user

    return checker
