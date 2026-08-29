"""เชิญเพื่อน — ดันยอด "เชิญเพื่อน" ในเกมด้วย guest ที่สร้างใหม่ (ฟรี ไม่ตัดเครดิต)

ทำงานแบบ synchronous เหมือนเมนูจัดการเพื่อน แต่หนักกว่ามาก เพราะ 1 คำขอ =
สร้างบัญชี guest ใหม่สูงสุด 29 ตัว ซึ่งไปแย่ง rate limit ของ DevPlay กับ worker
ฟาร์มหัวใจโดยตรง — เพดานต่อชั่วโมงจึงตั้งไว้ต่ำกว่าเมนูอื่นอย่างจงใจ
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from api.dependencies import check_maintenance, client_meta, get_current_user
from api.middleware.rate_limiter import rate_limiter
from core.exceptions import AppError
from models.schemas import InviteRunRequest, InviteStatusRequest
from services.invite_service import invite_service
from services.saved_account_service import saved_account_service

router = APIRouter(prefix="/api/invite", tags=["invite"])


@router.post("/status")
async def invite_status(
    body: InviteStatusRequest,
    request: Request,
    user=Depends(get_current_user),
    _maintenance=Depends(check_maintenance),
):
    # ฟีเจอร์ฟรีที่รับ email/password = เครื่องมือลองรหัส DevPlay ชั้นดีถ้าไม่คุม
    # จึงจำกัดทั้งรายผู้ใช้และราย IP เหมือนหน้าตรวจไอดี
    meta = client_meta(request)
    rate_limiter.check(f"invite_status:user:{user['id']}", limit=30, window_seconds=3600)
    rate_limiter.check(f"invite_status:ip:{meta.get('ip_address')}", limit=60, window_seconds=3600)

    email, password = await saved_account_service.resolve(
        user["id"], email=body.email, password=body.password, account_id=body.account_id
    )
    result = await invite_service.status(email, password)
    return {"email": email, **result.get("status", {})}


@router.post("/run")
async def invite_run(
    body: InviteRunRequest,
    request: Request,
    user=Depends(get_current_user),
    _maintenance=Depends(check_maintenance),
):
    meta = client_meta(request)
    # 5 ครั้ง/ชม. = สร้าง guest ได้สูงสุด ~145 ตัวต่อผู้ใช้ต่อชั่วโมง ซึ่งพอ ๆ กับ
    # งานฟาร์มหัวใจ 1 รอบ — สูงกว่านี้คิวฟาร์มจะเริ่มโดนเซิร์ฟเวอร์ปฏิเสธตาม
    rate_limiter.check(f"invite_run:user:{user['id']}", limit=5, window_seconds=3600)
    rate_limiter.check(f"invite_run:ip:{meta.get('ip_address')}", limit=10, window_seconds=3600)

    has_cred = bool(body.account_id or (body.email and body.password))
    target_mid = (body.target_mid or "").strip()
    if not has_cred and not target_mid:
        raise AppError(
            "invalid_request",
            "ต้องเลือกบัญชีเกม หรือกรอก MID ของไอดีที่จะให้ยอดเชิญขึ้น",
            400,
        )

    email = password = None
    if has_cred:
        # มี credential ให้ล็อกอินเสมอเมื่อส่งมา — MID จากการล็อกอินเชื่อถือได้กว่า
        # ที่ผู้ใช้พิมพ์เอง และทำให้ยืนยันยอดก่อน/หลังได้ในงานเดียวกัน
        email, password = await saved_account_service.resolve(
            user["id"], email=body.email, password=body.password, account_id=body.account_id
        )
        target_mid = ""

    result = await invite_service.invite(
        count=body.count, email=email, password=password, target_mid=target_mid
    )
    return {
        "ok": result.get("ok", False),
        "target_mid": result.get("target_mid") or "",
        "requested": result.get("requested", body.count),
        "success": result.get("success", 0),
        "already": result.get("already", 0),
        "failed": result.get("failed", 0),
        "create_fail": result.get("create_fail", 0),
        "invited_before": result.get("invited_before"),
        "invited_after": result.get("invited_after"),
        "gained": result.get("gained"),
        "errors": result.get("errors") or [],
        "status": result.get("status"),
    }
