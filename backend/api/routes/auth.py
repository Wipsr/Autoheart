"""Nickname/password auth against Supabase (synthetic email)."""
from __future__ import annotations

import re

from fastapi import APIRouter
from pydantic import BaseModel, Field

from core.exceptions import AppError, AuthError
from core.supabase_client import get_supabase_admin

router = APIRouter(prefix="/api/auth", tags=["auth"])

NICK_RE = re.compile(r"^[A-Za-z0-9_]{3,24}$")
AUTH_DOMAIN = "autoheart.com"


def nickname_to_email(nickname: str) -> str:
    return f"{nickname.strip().lower()}@{AUTH_DOMAIN}"


def normalize_nickname(nickname: str) -> str:
    nick = nickname.strip()
    if not NICK_RE.match(nick):
        raise AppError(
            "invalid_nickname",
            "ชื่อผู้ใช้ต้องเป็น A-Z, a-z, 0-9, _ ความยาว 3–24 ตัวอักษ",
        )
    return nick  # keep original casing for display; uniqueness via lower()


class RegisterRequest(BaseModel):
    nickname: str = Field(..., min_length=3, max_length=24)
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    nickname: str = Field(..., min_length=3, max_length=24)
    password: str = Field(..., min_length=6, max_length=128)


@router.post("/register")
async def register(body: RegisterRequest):
    nick = normalize_nickname(body.nickname)
    email = nickname_to_email(nick)
    db = get_supabase_admin()

    existing = (
        db.table("profiles")
        .select("id")
        .ilike("nickname", nick)
        .limit(1)
        .execute()
    )
    if existing.data:
        raise AppError("nickname_taken", "ชื่อผู้ใช้นี้ถูกใช้แล้ว", 409)

    try:
        created = db.auth.admin.create_user(
            {
                "email": email,
                "password": body.password,
                "email_confirm": True,
                "user_metadata": {
                    "nickname": nick,
                    "display_name": nick,
                },
            }
        )
    except Exception as e:
        msg = str(e)
        if "already" in msg.lower() or "registered" in msg.lower():
            raise AppError("nickname_taken", "ชื่อผู้ใช้นี้ถูกใช้แล้ว", 409) from e
        raise AppError("register_failed", f"สมัครไม่สำเร็จ: {msg}", 400) from e

    user = created.user
    if not user:
        raise AppError("register_failed", "สมัครไม่สำเร็จ", 400)

    # Ensure profile row (trigger should create it; upsert as safety)
    role = "admin" if nick.lower() == "evasi0m" else "user"
    db.table("profiles").upsert(
        {
            "id": user.id,
            "nickname": nick,
            "email": email,
            "display_name": nick,
            "role": role,
        }
    ).execute()

    # Sign in to return session for client
    anon = get_supabase_admin()  # service role can also generate session via sign_in
    # Use password grant via auth API
    from config import get_settings
    import httpx

    settings = get_settings()
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{settings.supabase_url}/auth/v1/token?grant_type=password",
            headers={
                "apikey": settings.supabase_anon_key,
                "Content-Type": "application/json",
            },
            json={"email": email, "password": body.password},
        )
    data = resp.json()
    if resp.status_code >= 400:
        return {
            "ok": True,
            "user_id": user.id,
            "nickname": nick,
            "message": "สมัครสำเร็จ กรุณาเข้าสู่ระบบ",
            "session": None,
        }

    return {
        "ok": True,
        "user_id": user.id,
        "nickname": nick,
        "session": {
            "access_token": data.get("access_token"),
            "refresh_token": data.get("refresh_token"),
            "expires_in": data.get("expires_in"),
            "token_type": data.get("token_type"),
        },
    }


@router.post("/login")
async def login(body: LoginRequest):
    nick = normalize_nickname(body.nickname)
    email = nickname_to_email(nick)

    from config import get_settings
    import httpx

    settings = get_settings()
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{settings.supabase_url}/auth/v1/token?grant_type=password",
            headers={
                "apikey": settings.supabase_anon_key,
                "Content-Type": "application/json",
            },
            json={"email": email, "password": body.password},
        )
    data = resp.json()
    if resp.status_code >= 400:
        raise AuthError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")

    db = get_supabase_admin()
    profile = (
        db.table("profiles")
        .select("id, nickname, display_name, role, credits, is_banned")
        .ilike("nickname", nick)
        .limit(1)
        .execute()
    )
    if profile.data and profile.data[0].get("is_banned"):
        raise AppError("banned", "บัญชีถูกระงับ", 403)

    return {
        "ok": True,
        "nickname": nick,
        "profile": profile.data[0] if profile.data else None,
        "session": {
            "access_token": data.get("access_token"),
            "refresh_token": data.get("refresh_token"),
            "expires_in": data.get("expires_in"),
            "token_type": data.get("token_type"),
            "user": data.get("user"),
        },
    }


@router.get("/check-nickname/{nickname}")
async def check_nickname(nickname: str):
    try:
        nick = normalize_nickname(nickname)
    except AppError:
        return {"available": False, "reason": "invalid"}
    db = get_supabase_admin()
    existing = (
        db.table("profiles").select("id").ilike("nickname", nick).limit(1).execute()
    )
    return {"available": not bool(existing.data), "nickname": nick}
