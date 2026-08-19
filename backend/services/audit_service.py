from __future__ import annotations

from typing import Any

from core.supabase_client import get_supabase_admin


class AuditService:
    def log(
        self,
        admin_id: str,
        action: str,
        entity_type: str,
        entity_id: str | None,
        before_data: dict[str, Any] | None = None,
        after_data: dict[str, Any] | None = None,
        ip_address: str | None = None,
    ) -> None:
        get_supabase_admin().table("admin_audit_logs").insert(
            {
                "admin_id": admin_id,
                "action": action,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "before_data": before_data,
                "after_data": after_data,
                "ip_address": ip_address,
            }
        ).execute()


audit_service = AuditService()
