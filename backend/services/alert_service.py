"""Persisted operational alerts with optional Telegram delivery."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from config import get_settings
from core.supabase_client import get_supabase_admin
from services.notification_service import notification_service


class AlertService:
    def __init__(self) -> None:
        self.db = get_supabase_admin()

    def _cooldown_active(self, alert_key: str) -> bool:
        cutoff = (
            datetime.now(timezone.utc)
            - timedelta(seconds=get_settings().telegram_alert_cooldown_seconds)
        ).isoformat()
        rows = (
            self.db.table("alert_events")
            .select("id")
            .eq("alert_key", alert_key)
            .neq("delivery_status", "suppressed")
            .gte("created_at", cutoff)
            .limit(1)
            .execute()
        )
        return bool(rows.data)

    async def send(
        self,
        alert_key: str,
        title: str,
        message: str,
        severity: str = "warning",
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        if self._cooldown_active(alert_key):
            self.db.table("alert_events").insert(
                {
                    "alert_key": alert_key,
                    "severity": severity,
                    "title": title,
                    "message": message,
                    "details": details,
                    "delivery_status": "suppressed",
                }
            ).execute()
            return

        created = (
            self.db.table("alert_events")
            .insert(
                {
                    "alert_key": alert_key,
                    "severity": severity,
                    "title": title,
                    "message": message,
                    "details": details,
                }
            )
            .execute()
        )
        event = (created.data or [{}])[0]
        status = "suppressed"
        settings = get_settings()
        if settings.telegram_bot_token and settings.telegram_chat_id:
            try:
                url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
                text = f"[{severity.upper()}] {title}\n{message}"
                async with httpx.AsyncClient(timeout=10) as client:
                    response = await client.post(
                        url,
                        json={"chat_id": settings.telegram_chat_id, "text": text},
                    )
                    response.raise_for_status()
                status = "sent"
            except Exception:
                status = "failed"
        if event.get("id"):
            self.db.table("alert_events").update(
                {
                    "delivery_status": status,
                    "delivered_at": datetime.now(timezone.utc).isoformat()
                    if status == "sent"
                    else None,
                }
            ).eq("id", event["id"]).execute()
        await notification_service.broadcast_admin(
            {"type": "alert", "severity": severity, "title": title, "message": message}
        )


alert_service = AlertService()
