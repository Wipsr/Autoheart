"""บัญชีเกมที่ผู้ใช้ save ไว้ — เพิ่ม/ดู/ลบ (จัดการในหน้า "ตั้งค่า")

รหัสผ่านถูกเข้ารหัสก่อนเก็บ (saved_account_service) และไม่เคยส่งกลับหน้าเว็บ
endpoint list คืนแค่ email/label/mid/nickname เท่านั้น
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from api.dependencies import check_maintenance, client_meta, get_current_user
from api.middleware.rate_limiter import rate_limiter
from models.schemas import SavedAccountCreateRequest
from services.devplay_auth_service import devplay_auth_service
from services.saved_account_service import saved_account_service

router = APIRouter(prefix="/api/accounts", tags=["saved-accounts"])


@router.get("")
async def list_accounts(user=Depends(get_current_user)):
    return {"accounts": await saved_account_service.list_for_user(user["id"])}


@router.post("")
async def create_account(
    body: SavedAccountCreateRequest,
    request: Request,
    user=Depends(get_current_user),
    _maintenance=Depends(check_maintenance),
):
    # การบันทึกต้องล็อกอิน DevPlay จริง = เป็นช่องลองรหัสได้ จึงจำกัดเหมือนหน้าอื่น
    meta = client_meta(request)
    rate_limiter.check(f"account_save:user:{user['id']}", limit=20, window_seconds=3600)
    rate_limiter.check(f"account_save:ip:{meta.get('ip_address')}", limit=40, window_seconds=3600)

    mid = None
    nickname = None
    if body.verify:
        vr = await devplay_auth_service.verify_credentials(body.email, body.password)
        if not vr.get("valid"):
            return {
                "ok": False,
                "error": "validation_failed",
                "error_message": vr.get("error_message"),
                "error_code": vr.get("error_code"),
            }
        mid = vr.get("mid")

    account = await saved_account_service.create(
        user["id"], body.email, body.password, label=body.label or "", mid=mid, nickname=nickname
    )
    return {"ok": True, "account": account}


@router.delete("/{account_id}")
async def delete_account(account_id: str, user=Depends(get_current_user)):
    await saved_account_service.delete(user["id"], account_id)
    return {"ok": True}
