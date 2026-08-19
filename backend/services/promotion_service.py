from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from core.exceptions import AppError
from core.supabase_client import get_supabase_admin
from config import get_settings
from services.devplay_auth_service import devplay_auth_service


class PromotionService:
    def active(self) -> list[dict]:
        now = datetime.now(timezone.utc).isoformat()
        return (
            get_supabase_admin()
            .table("promotions")
            .select("id,slug,title,type,hearts_reward,requires_devplay,ends_at")
            .eq("is_active", True)
            .or_(f"starts_at.is.null,starts_at.lte.{now}")
            .or_(f"ends_at.is.null,ends_at.gte.{now}")
            .execute()
            .data
            or []
        )

    @staticmethod
    def _hash_email(email: str) -> tuple[str, str]:
        normalized = email.strip().lower()
        pepper = get_settings().credentials_encryption_key
        return normalized, hashlib.sha256(f"{pepper}:{normalized}".encode()).hexdigest()

    async def claim(self, promotion_id: str, user_id: str, email: str, password: str, ip: str | None) -> dict:
        db = get_supabase_admin()
        found = db.table("promotions").select("*").eq("id", promotion_id).limit(1).execute()
        if not found.data:
            raise AppError("promotion_not_found", "ไม่พบโปรโมชัน")
        promotion = found.data[0]
        now = datetime.now(timezone.utc)
        if not promotion["is_active"] or (promotion.get("starts_at") and datetime.fromisoformat(promotion["starts_at"].replace("Z", "+00:00")) > now) or (promotion.get("ends_at") and datetime.fromisoformat(promotion["ends_at"].replace("Z", "+00:00")) < now):
            raise AppError("promotion_inactive", "โปรโมชันนี้ยังใช้ไม่ได้หรือหมดอายุแล้ว")
        verified = await devplay_auth_service.verify_credentials(email, password)
        if not verified.get("valid"):
            raise AppError("invalid_devplay", verified.get("error_message") or "ตรวจสอบ DevPlay ไม่สำเร็จ")
        normalized, fingerprint = self._hash_email(email)
        claim = {
            "promotion_id": promotion_id,
            "user_id": user_id,
            "devplay_email_normalized": normalized,
            "devplay_email_hash": fingerprint,
            "hearts_credited": promotion["hearts_reward"],
            "ip_address": ip,
        }
        try:
            db.table("promotion_claims").insert(claim).execute()
        except Exception as exc:
            raise AppError("promotion_already_claimed", "บัญชีหรือ DevPlay นี้ใช้สิทธิ์ไปแล้ว", 409) from exc
        try:
            db.rpc("credit_user_hearts", {"p_user_id": user_id, "p_hearts": promotion["hearts_reward"], "p_baht": 0}).execute()
        except Exception:
            db.table("promotion_claims").delete().eq("promotion_id", promotion_id).eq("user_id", user_id).execute()
            raise
        return {"ok": True, "hearts_credited": promotion["hearts_reward"], "title": promotion["title"]}


promotion_service = PromotionService()
