"""Proxy configuration service."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from core.supabase_client import get_supabase_admin


class ProxyService:
    def get_config(self) -> Optional[dict[str, Any]]:
        db = get_supabase_admin()
        res = db.table("proxy_config").select("*").order("id").limit(1).execute()
        return res.data[0] if res.data else None

    def get_active_proxy_url(self) -> str:
        cfg = self.get_config()
        if cfg and cfg.get("is_enabled") and cfg.get("proxy_url"):
            return cfg["proxy_url"]
        return ""

    def update(self, proxy_url: str, is_enabled: bool, updated_by: str | None = None) -> dict[str, Any]:
        db = get_supabase_admin()
        cfg = self.get_config()
        payload = {
            "proxy_url": proxy_url,
            "is_enabled": is_enabled,
            "updated_by": updated_by,
        }
        if cfg:
            res = db.table("proxy_config").update(payload).eq("id", cfg["id"]).execute()
            return res.data[0]
        payload["name"] = "default"
        res = db.table("proxy_config").insert(payload).execute()
        return res.data[0]

    async def test_proxy(self, proxy_url: str | None = None) -> dict[str, Any]:
        url = proxy_url if proxy_url is not None else self.get_active_proxy_url()
        db = get_supabase_admin()
        cfg = self.get_config()
        if not url:
            result = {"ok": False, "message": "ไม่มี proxy URL"}
        else:
            try:
                async with httpx.AsyncClient(proxy=url, timeout=15.0) as client:
                    r = await client.get("https://api.ipify.org?format=json")
                    ip = r.json().get("ip")
                    result = {"ok": True, "message": f"OK — exit IP {ip}", "ip": ip}
            except Exception as e:
                result = {"ok": False, "message": str(e)}

        if cfg:
            db.table("proxy_config").update(
                {
                    "last_tested_at": datetime.now(timezone.utc).isoformat(),
                    "last_test_ok": result["ok"],
                    "last_test_message": result["message"],
                }
            ).eq("id", cfg["id"]).execute()
        return result


proxy_service = ProxyService()
