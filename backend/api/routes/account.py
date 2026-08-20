"""เช็คข้อมูลไอดี — โชว์ wallet/ของในคลังของบัญชีเกม (ฟรี ไม่ตัดเครดิต)

ดึงข้อมูลผ่าน ngmx_service (proxy ไป ngmx) ดู services/ngmx_service.py ว่าทำไม
จึงต้อง proxy และมีข้อควรระวังอะไรเรื่องรหัสผ่าน

รูป asset เสิร์ฟผ่าน /api/account/image/{kind}/{tag} เพราะรูปฝั่ง ngmx ถูกล็อก
หลัง session — browser ผู้ใช้ยิงตรงไม่ได้ ต้องให้ backend เป็นตัวกลาง
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Request, Response

from api.dependencies import check_maintenance, client_meta, get_current_user
from api.middleware.rate_limiter import rate_limiter
from models.schemas import AccountInspectRequest
from services.ngmx_service import ngmx_service

router = APIRouter(prefix="/api/account", tags=["account"])

# tag ของรูปมาจากข้อมูล ngmx เอง (เช่น "ch06", "202701", "tr_pet94") จำกัดอักขระ
# ไว้กัน path traversal / ยิงต่อไปที่ path อื่นของ ngmx
_TAG_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


@router.post("/inspect")
async def inspect_account(
    body: AccountInspectRequest,
    request: Request,
    user=Depends(get_current_user),
    _maintenance=Depends(check_maintenance),
):
    # ฟีเจอร์ฟรีที่รับ email/password = เครื่องมือลองรหัสชั้นดีถ้าไม่คุม จึงจำกัด
    # ทั้งรายผู้ใช้และราย IP เหมือนหน้าจัดการเพื่อน/ตรวจไอดี
    meta = client_meta(request)
    rate_limiter.check(f"account_inspect:user:{user['id']}", limit=30, window_seconds=3600)
    rate_limiter.check(f"account_inspect:ip:{meta.get('ip_address')}", limit=60, window_seconds=3600)

    # ngmx_service คืนข้อมูลก้อนเดิม (wallet/owned/…) ส่งต่อตรง ๆ ไม่ต้องแปลง
    # ฟิลด์ image ในแต่ละ item เป็น tag ที่หน้าเว็บเอาไปต่อเป็น /api/account/image/…
    return await ngmx_service.inspect(body.email, body.password)


@router.get("/image/{kind}/{tag}")
async def account_image(kind: str, tag: str):
    # ไม่ผูก auth เพราะ <img> ส่ง Bearer token ไม่ได้ — ป้องกันด้วยการจำกัด kind/tag
    # ให้ยิงได้เฉพาะ endpoint รูปของ ngmx เท่านั้น (ไม่ใช่ open proxy)
    if not _TAG_RE.match(tag):
        return Response(status_code=404)
    content, content_type = await ngmx_service.fetch_image(kind, tag)
    return Response(
        content=content,
        media_type=content_type,
        # รูป asset นิ่ง เปลี่ยนยาก แคชได้ยาว ๆ ลดภาระ proxy ต่อ ngmx
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )
