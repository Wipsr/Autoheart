"""FastAPI dependencies: current user / admin."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import Depends, Header, Request

from core.exceptions import AuthError, ForbiddenError, MaintenanceError
from core.security import decode_supabase_jwt
from core.supabase_client import get_supabase_admin


async def get_bearer_token(
    authorization: Optional[str] = Header(default=None),
) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthError("Missing Authorization Bearer token")
    return authorization.split(" ", 1)[1].strip()


async def get_current_user(token: str = Depends(get_bearer_token)) -> dict[str, Any]:
    claims = decode_supabase_jwt(token)
    user_id = claims.get("sub")
    if not user_id:
        raise AuthError("Invalid token payload")

    db = get_supabase_admin()
    res = db.table("profiles").select("*").eq("id", user_id).limit(1).execute()
    if not res.data:
        # Ensure profile exists (edge case if trigger missed)
        email = claims.get("email") or ""
        db.table("profiles").upsert({"id": user_id, "email": email}).execute()
        res = db.table("profiles").select("*").eq("id", user_id).limit(1).execute()

    profile = res.data[0]
    if profile.get("is_banned"):
        raise ForbiddenError(profile.get("banned_reason") or "บัญชีถูกระงับ")
    profile["_token"] = token
    profile["_claims"] = claims
    return profile


async def get_admin_user(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") != "admin":
        raise ForbiddenError("Admin only")
    return user


async def check_maintenance(request: Request) -> None:
    # Allow admin routes and health
    path = request.url.path
    if path.startswith("/api/admin") or path.startswith("/api/public") or path.startswith("/api/auth") or path in ("/health", "/", "/docs", "/openapi.json"):
        return
    db = get_supabase_admin()
    res = (
        db.table("system_settings")
        .select("value")
        .eq("key", "maintenance_mode")
        .limit(1)
        .execute()
    )
    if res.data and str(res.data[0].get("value")).lower() in ("true", "1", "yes"):
        message = "ระบบปิดปรับปรุงชั่วคราว"
        eta = (
            db.table("system_settings").select("value").eq("key", "maintenance_eta").limit(1).execute().data
        )
        if eta and eta[0].get("value"):
            message = f"{message} — คาดว่าจะกลับมา {eta[0]['value']}"
        raise MaintenanceError(message)


def client_meta(request: Request) -> dict[str, Any]:
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return {"ip_address": ip, "user_agent": ua}
