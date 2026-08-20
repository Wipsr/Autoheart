"""จัดการรายชื่อเพื่อนในเกม — ฟรี ไม่ตัดเครดิต ไม่เข้าคิว worker

ทำงานแบบ synchronous เพราะ 2 คำสั่งนี้ใช้เวลาไม่กี่วินาที ต่างจากงานฟาร์มหัวใจ
ที่กินเวลาหลายนาทีจนต้องมีคิว + WebSocket
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from api.dependencies import check_maintenance, client_meta, get_current_user
from api.middleware.rate_limiter import rate_limiter
from models.schemas import FriendDeleteRequest, FriendListRequest
from services.friend_service import friend_service
from services.saved_account_service import saved_account_service

router = APIRouter(prefix="/api/friends", tags=["friends"])


@router.post("/list")
async def list_friends(
    body: FriendListRequest,
    request: Request,
    user=Depends(get_current_user),
    _maintenance=Depends(check_maintenance),
):
    # ฟีเจอร์ฟรีที่รับ email/password = เครื่องมือลองรหัส DevPlay ชั้นดีถ้าไม่คุม
    # จึงจำกัดทั้งรายผู้ใช้และราย IP เหมือนหน้าตรวจไอดี
    meta = client_meta(request)
    rate_limiter.check(f"friends_list:user:{user['id']}", limit=30, window_seconds=3600)
    rate_limiter.check(f"friends_list:ip:{meta.get('ip_address')}", limit=60, window_seconds=3600)

    email, password = await saved_account_service.resolve(
        user["id"], email=body.email, password=body.password, account_id=body.account_id
    )
    result = await friend_service.list_friends(email, password)
    return {
        "email": email,
        "mid": result.get("mid"),
        "level": result.get("level"),
        "friend_cap": result.get("friend_cap"),
        "friend_count": result.get("friend_count", 0),
        "friends": result.get("friends") or [],
    }


@router.post("/delete")
async def delete_friends(
    body: FriendDeleteRequest,
    request: Request,
    user=Depends(get_current_user),
    _maintenance=Depends(check_maintenance),
):
    meta = client_meta(request)
    rate_limiter.check(f"friends_delete:user:{user['id']}", limit=20, window_seconds=3600)
    rate_limiter.check(f"friends_delete:ip:{meta.get('ip_address')}", limit=40, window_seconds=3600)

    email, password = await saved_account_service.resolve(
        user["id"], email=body.email, password=body.password, account_id=body.account_id
    )
    result = await friend_service.delete_friends(email, password, body.player_ids)
    return {
        "ok": result.get("ok", False),
        "requested": result.get("requested", len(body.player_ids)),
        "removed": result.get("removed", 0),
        "failed": result.get("failed") or [],
        "skipped_not_friend": result.get("skipped_not_friend", 0),
        "friend_count": result.get("friend_count", 0),
        "friends": result.get("friends") or [],
    }
