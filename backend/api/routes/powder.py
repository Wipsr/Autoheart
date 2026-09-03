"""ปั๊มผงเวทมนตร์ผ่านระบบชวนเพื่อนในเกม — ฟรี ไม่ตัดเครดิต ไม่เข้าคิว worker

ทำงานแบบ synchronous เหมือนหน้าจัดการเพื่อน/ตรวจไอดี ไม่ใช่งานเข้าคิวแบบฟาร์ม
หัวใจ เพราะไม่ต้องรายงานความคืบหน้าระหว่างทางผ่าน WebSocket — กดครั้งเดียวจบ
แล้วคืนสรุปผลทีเดียว (แม้ count สูง ๆ จะใช้เวลาหลายนาทีก็ตาม)

กลไกและข้อจำกัดของฟีเจอร์นี้อยู่ใน heart_farm/powder_tool.py
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from api.dependencies import check_maintenance, client_meta, get_current_user
from api.middleware.rate_limiter import rate_limiter
from models.schemas import PowderPumpRequest, PowderStatusRequest
from services.powder_service import powder_service
from services.saved_account_service import saved_account_service

router = APIRouter(prefix="/api/powder", tags=["powder"])


@router.post("/status")
async def powder_status(
    body: PowderStatusRequest,
    request: Request,
    user=Depends(get_current_user),
    _maintenance=Depends(check_maintenance),
):
    # ฟีเจอร์ฟรีที่รับ email/password = เครื่องมือลองรหัสชั้นดีถ้าไม่คุม จึงจำกัด
    # ทั้งรายผู้ใช้และราย IP เหมือนหน้าตรวจไอดี/จัดการเพื่อน
    meta = client_meta(request)
    rate_limiter.check(f"powder_status:user:{user['id']}", limit=30, window_seconds=3600)
    rate_limiter.check(f"powder_status:ip:{meta.get('ip_address')}", limit=60, window_seconds=3600)

    email, password = await saved_account_service.resolve(
        user["id"], email=body.email, password=body.password, account_id=body.account_id
    )
    result = await powder_service.status(email, password)
    return {"email": email, **{k: v for k, v in result.items() if k != "ok"}}


@router.post("/pump")
async def powder_pump(
    body: PowderPumpRequest,
    request: Request,
    user=Depends(get_current_user),
    _maintenance=Depends(check_maintenance),
):
    # คุมเข้มกว่า status มาก เพราะการกด 1 ครั้งสร้างบัญชี guest ได้ถึง 300 ใบ
    # ซึ่งกินทั้งโควตา proxy และโดน login server จำกัดต่อ IP อยู่แล้ว
    meta = client_meta(request)
    rate_limiter.check(f"powder_pump:user:{user['id']}", limit=6, window_seconds=3600)
    rate_limiter.check(f"powder_pump:ip:{meta.get('ip_address')}", limit=10, window_seconds=3600)

    email, password = await saved_account_service.resolve(
        user["id"], email=body.email, password=body.password, account_id=body.account_id
    )
    result = await powder_service.pump(email, password, body.count)
    return {"email": email, **{k: v for k, v in result.items() if k != "ok"}}
