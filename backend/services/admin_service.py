"""Admin aggregation queries."""
from __future__ import annotations

from typing import Any, Optional

from core.supabase_client import get_supabase_admin


class AdminService:
    def __init__(self):
        self.db = get_supabase_admin()

    def overview(self) -> dict[str, Any]:
        profiles = self.db.table("profiles").select("id", count="exact").execute()
        jobs_active = (
            self.db.table("jobs")
            .select("id", count="exact")
            .in_("status", ["queued", "processing", "validating"])
            .execute()
        )
        jobs_today = self.db.table("jobs").select("id", count="exact").execute()
        topups_manual = (
            self.db.table("topup_redemptions")
            .select("id", count="exact")
            .eq("status", "needs_manual")
            .execute()
        )
        credited = (
            self.db.table("topup_redemptions")
            .select("amount_baht, hearts_credited")
            .eq("status", "credited")
            .execute()
        )
        revenue = sum(float(r.get("amount_baht") or 0) for r in (credited.data or []))
        hearts = sum(int(r.get("hearts_credited") or 0) for r in (credited.data or []))
        return {
            "users": profiles.count or 0,
            "active_jobs": jobs_active.count or 0,
            "total_jobs": jobs_today.count or 0,
            "needs_manual_topups": topups_manual.count or 0,
            "revenue_baht": revenue,
            "hearts_credited": hearts,
        }

    def list_users(self, limit: int = 50, offset: int = 0, q: str | None = None) -> list[dict]:
        query = self.db.table("profiles").select("*").order("created_at", desc=True)
        if q:
            query = query.ilike("nickname", f"%{q}%")
        return query.range(offset, offset + limit - 1).execute().data or []

    def get_user(self, user_id: str) -> Optional[dict]:
        res = self.db.table("profiles").select("*").eq("id", user_id).limit(1).execute()
        return res.data[0] if res.data else None

    def set_ban(self, user_id: str, banned: bool, reason: str | None = None) -> dict:
        payload = {"is_banned": banned, "banned_reason": reason}
        res = self.db.table("profiles").update(payload).eq("id", user_id).execute()
        return res.data[0]

    def list_jobs(self, status: str | None = None, limit: int = 50, offset: int = 0) -> list[dict]:
        query = self.db.table("jobs").select("*").order("created_at", desc=True)
        if status:
            query = query.eq("status", status)
        return query.range(offset, offset + limit - 1).execute().data or []

    def list_topups(self, status: str | None = None, limit: int = 50, offset: int = 0) -> list[dict]:
        query = self.db.table("topup_redemptions").select("*").order("created_at", desc=True)
        if status:
            query = query.eq("status", status)
        return query.range(offset, offset + limit - 1).execute().data or []

    def get_settings(self) -> list[dict]:
        return self.db.table("system_settings").select("*").execute().data or []

    def update_setting(self, key: str, value: str, updated_by: str | None = None) -> dict:
        res = (
            self.db.table("system_settings")
            .upsert({"key": key, "value": value, "updated_by": updated_by})
            .execute()
        )
        return res.data[0]


admin_service = AdminService()
