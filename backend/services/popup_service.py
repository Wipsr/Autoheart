from __future__ import annotations

from datetime import datetime, timezone

from core.supabase_client import get_supabase_admin


class PopupService:
    def site_config(self, audience: str = "all") -> dict:
        db = get_supabase_admin()
        setting_rows = db.table("system_settings").select("key,value").in_(
            "key", ["maintenance_mode", "maintenance_message", "maintenance_eta", "site_banner_enabled", "site_banner_text"]
        ).execute().data or []
        settings = {row["key"]: row["value"] for row in setting_rows}
        now = datetime.now(timezone.utc).isoformat()
        query = db.table("site_popups").select("*").eq("is_active", True).or_(
            f"starts_at.is.null,starts_at.lte.{now}"
        ).or_(f"ends_at.is.null,ends_at.gte.{now}").order("priority", desc=True).limit(1)
        rows = query.execute().data or []
        popup = next((p for p in rows if p["show_on"] in ("all", audience)), None)
        return {
            "maintenance": {
                "enabled": settings.get("maintenance_mode", "false").lower() == "true",
                "message": settings.get("maintenance_message", ""),
                "eta": settings.get("maintenance_eta", ""),
            },
            "banner": {
                "enabled": settings.get("site_banner_enabled", "false").lower() == "true",
                "text": settings.get("site_banner_text", ""),
            },
            "popup": popup,
        }


popup_service = PopupService()
