from __future__ import annotations

import binascii
import base64
import json
import hashlib
import hmac
import os
import secrets
import time
from typing import Any

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import User
from app.db.session import get_db


PASSWORD_ALGORITHM = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 240_000
AUTH_COOKIE_NAME = "freemate_auth"
AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30


def normalize_username(username: str) -> str:
    value = username.strip().lower()
    if not value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Choose a username.",
        )
    if len(value) < 3 or len(value) > 64:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username must be between 3 and 64 characters.",
        )
    if any(ch.isspace() for ch in value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username cannot contain spaces.",
        )
    return value


def hash_password(password: str) -> str:
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters long.",
        )

    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )
    return "$".join(
        [
            PASSWORD_ALGORITHM,
            str(PASSWORD_ITERATIONS),
            base64.urlsafe_b64encode(salt).decode("ascii").rstrip("="),
            base64.urlsafe_b64encode(digest).decode("ascii").rstrip("="),
        ]
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, salt_b64, digest_b64 = stored_hash.split("$", 3)
        if algorithm != PASSWORD_ALGORITHM:
            return False

        salt = base64.urlsafe_b64decode(_restore_padding(salt_b64))
        expected_digest = base64.urlsafe_b64decode(_restore_padding(digest_b64))
        candidate_digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            int(iterations),
        )
    except (ValueError, TypeError, UnicodeError, binascii.Error):
        return False

    return hmac.compare_digest(candidate_digest, expected_digest)


def serialize_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
    }


def get_auth_cookie_secret() -> str:
    return os.getenv("SESSION_SECRET_KEY") or os.getenv("SECRET_KEY") or "freemate-dev-session-secret"


def should_secure_auth_cookie() -> bool:
    flag = os.getenv("SESSION_COOKIE_SECURE")
    if flag is not None:
        return flag.strip().lower() in {"1", "true", "yes", "on"}
    return bool(os.getenv("RENDER"))


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_user_by_username(db: Session, username: str) -> User | None:
    normalized = normalize_username(username)
    statement = select(User).where(User.username == normalized)
    return db.scalar(statement)


def create_user(db: Session, username: str, password: str) -> User:
    normalized_username = normalize_username(username)

    if db.scalar(select(User.id).where(User.username == normalized_username)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That username is already taken.",
        )

    user = User(
        email=None,
        username=normalized_username,
        password_hash=hash_password(password),
    )
    db.add(user)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That account already exists.",
        ) from exc

    db.refresh(user)
    return user


def authenticate_user(db: Session, username: str, password: str) -> User:
    user = get_user_by_username(db, username)
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )
    return user


def set_current_user_session(response: Response, user: User) -> None:
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=create_auth_cookie_value(user.id),
        max_age=AUTH_COOKIE_MAX_AGE,
        httponly=True,
        secure=should_secure_auth_cookie(),
        samesite="lax",
        path="/",
    )


def clear_current_user_session(response: Response) -> None:
    response.delete_cookie(key=AUTH_COOKIE_NAME, path="/")


def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
) -> User | None:
    user_id = read_auth_cookie(request)
    if user_id is None:
        return None

    user = get_user_by_id(db, user_id)
    if user is None:
        return None
    return user


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    user = get_current_user_optional(request, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="You are not signed in.",
        )
    return user


def _restore_padding(value: str) -> str:
    return value + "=" * (-len(value) % 4)


def create_auth_cookie_value(user_id: int) -> str:
    payload = {
        "user_id": user_id,
        "issued_at": int(time.time()),
    }
    payload_json = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_json).decode("ascii").rstrip("=")
    signature = _sign_payload(payload_b64)
    return f"{payload_b64}.{signature}"


def read_auth_cookie(request: Request) -> int | None:
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        return None

    try:
        payload_b64, signature = token.split(".", 1)
    except ValueError:
        return None

    if not hmac.compare_digest(signature, _sign_payload(payload_b64)):
        return None

    try:
        payload = json.loads(base64.urlsafe_b64decode(_restore_padding(payload_b64)).decode("utf-8"))
    except (ValueError, TypeError, UnicodeError, json.JSONDecodeError, binascii.Error):
        return None

    issued_at = payload.get("issued_at")
    user_id = payload.get("user_id")
    if not isinstance(issued_at, int) or not isinstance(user_id, int):
        return None
    if int(time.time()) - issued_at > AUTH_COOKIE_MAX_AGE:
        return None

    return user_id


def _sign_payload(payload_b64: str) -> str:
    digest = hmac.new(
        get_auth_cookie_secret().encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
