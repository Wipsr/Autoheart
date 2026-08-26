"""จัดการบัญชีเกม DevPlay ที่ผู้ใช้ save ไว้ (เพื่อไม่ต้องกรอกรหัสซ้ำ)

รหัสผ่านเก็บแบบเข้ารหัส AES-GCM (core.security) ด้วยคีย์ฝั่งเซิร์ฟเวอร์ ตารางนี้
เข้าถึงผ่าน service_role เท่านั้น (RLS ปิดตายสำหรับ client) — ไฟล์นี้เป็นที่เดียว
ที่ถอดรหัสออกมาใช้ และต้องไม่ปล่อย plaintext/ciphertext ออกไปทาง API เด็ดขาด
"""
from __future__ import annotations

from typing import Any, Optional

from core.exceptions import AppError, NotFoundError
from core.security import decrypt_password, encrypt_password
from core.supabase_client import get_supabase_admin

# คอลัมน์ที่ปลอดภัยจะส่งกลับหน้าเว็บ — ไม่มี devplay_password_encrypted
_SAFE_COLUMNS = "id, label, devplay_email, mid, nickname, created_at, updated_at"


def _safe_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "label": row.get("label") or "",
        "email": row["devplay_email"],
        "mid": row.get("mid"),
        "nickname": row.get("nickname"),
        "created_at": row.get("created_at"),
    }


class SavedAccountService:
    async def list_for_user(self, user_id: str) -> list[dict[str, Any]]:
        db = get_supabase_admin()
        res = (
            db.table("saved_accounts")
            .select(_SAFE_COLUMNS)
            .eq("user_id", user_id)
            .order("created_at", desc=False)
            .execute()
        )
        return [_safe_row(r) for r in (res.data or [])]

    async def create(
        self,
        user_id: str,
        email: str,
        password: str,
        label: str = "",
        mid: Optional[str] = None,
        nickname: Optional[str] = None,
    ) -> dict[str, Any]:
        email = (email or "").strip()
        if not email or not password:
            raise AppError("invalid_request", "กรุณากรอกอีเมลและรหัสผ่าน", 400)

        db = get_supabase_admin()
        row = {
            "user_id": user_id,
            "label": (label or "").strip(),
            "devplay_email": email,
            "devplay_password_encrypted": encrypt_password(password),
            "mid": mid,
            "nickname": nickname,
        }
        # อีเมลเดิมของ user คนเดิม = อัปเดตทับ (รหัสใหม่/ป้ายใหม่) ไม่สร้างซ้ำ
        res = (
            db.table("saved_accounts")
            .upsert(row, on_conflict="user_id,devplay_email")
            .execute()
        )
        return _safe_row(res.data[0])

    async def delete(self, user_id: str, account_id: str) -> None:
        db = get_supabase_admin()
        # กรอง user_id ด้วยเสมอ กันลบบัญชีของคนอื่นด้วยการเดา id
        res = (
            db.table("saved_accounts")
            .delete()
            .eq("id", account_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not res.data:
            raise NotFoundError("ไม่พบบัญชีที่บันทึกไว้")

    async def get_credentials(self, user_id: str, account_id: str) -> tuple[str, str]:
        """คืน (email, password ที่ถอดรหัสแล้ว) ของบัญชีที่ผู้ใช้เป็นเจ้าของ

        ใช้ภายในเท่านั้น — ห้ามส่งค่าที่คืนออกไปทาง API
        """
        db = get_supabase_admin()
        res = (
            db.table("saved_accounts")
            .select("devplay_email, devplay_password_encrypted")
            .eq("id", account_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            raise NotFoundError("ไม่พบบัญชีที่บันทึกไว้")
        row = res.data[0]
        return row["devplay_email"], decrypt_password(row["devplay_password_encrypted"])

    async def resolve(
        self,
        user_id: str,
        *,
        email: Optional[str] = None,
        password: Optional[str] = None,
        account_id: Optional[str] = None,
    ) -> tuple[str, str]:
        """แปลงคำขอที่ส่ง 'account_id (บัญชีที่ save)' หรือ 'email+password (กรอกเอง)'
        ให้เป็น (email, password) ชุดเดียวสำหรับเอาไปล็อกอิน

        ให้ account_id มาก่อน ถ้าไม่มีค่อยใช้ email+password ที่กรอกสด
        """
        if account_id:
            return await self.get_credentials(user_id, account_id)
        email = (email or "").strip()
        if email and password:
            return email, password
        raise AppError("invalid_request", "ต้องเลือกบัญชีที่บันทึกไว้ หรือกรอกอีเมลและรหัสผ่าน", 400)


saved_account_service = SavedAccountService()
