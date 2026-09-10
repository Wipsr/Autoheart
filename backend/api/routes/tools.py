"""เครื่องมือฟรีที่ยืมจาก ngmx — ปั๊มผงเวทมนตร์ / เปิดกล่องของขวัญ / ตี + สมบัติ

ฟรี ไม่ตัดเครดิต และ "ไม่เข้าคิว worker ของเรา" เพราะงานรันอยู่ฝั่ง ngmx
(คิวของเขาเอง) เหมือนหน้าจัดการเพื่อน/ตรวจไอดี — ดู services/ngmx_service.py
ว่าทำไมถึงยืมแทนที่จะทำเอง

ทุกเครื่องมือมี 2 จังหวะ:
  1. POST /api/tools/{slug}/scan  — ล็อกอินดูยอดปัจจุบัน เพื่อให้ตั้งเป้าได้
  2. WS   /ws/tools/{slug}        — สั่งงานแล้วถ่ายทอด log/progress สด ๆ

ที่ต้องเป็น WebSocket ไม่ใช่ POST ธรรมดา เพราะงานปั๊มผงยาวได้เป็นสิบนาที และ
ต้องปิดงานให้ด้วยเมื่อผู้ใช้ปิดหน้าเว็บ (ngmx_service.run ยิง cancel ให้ตอน
generator ถูกปิด) — และเป็น WS แทน SSE เพราะ EventSource ส่ง Bearer token ไม่ได้
ทั้งเว็บนี้จึงส่ง token ทาง query เหมือน /ws/jobs, /ws/queue
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Query, Request, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from api.dependencies import (
    assert_not_in_maintenance,
    check_maintenance,
    client_meta,
    get_current_user,
)
from api.middleware.rate_limiter import rate_limiter
from core.exceptions import AppError
from models.schemas import (
    GiftBoxRunParams,
    PowderRunParams,
    ToolScanRequest,
    TreasureRunParams,
)
from services.ngmx_service import TOOLS, NgmxError, ngmx_service
from services.saved_account_service import saved_account_service

router = APIRouter(prefix="/api/tools", tags=["tools"])
ws_router = APIRouter(tags=["tools"])


@router.get("")
async def list_tools(user=Depends(get_current_user)):
    """รายการเครื่องมือให้หน้าเว็บเอาไปโชว์ — คงลำดับเดียวกับใน TOOLS"""
    return {
        "tools": [
            {"slug": t.slug, "name": t.name, "unit_label": t.unit_label}
            for t in TOOLS.values()
        ]
    }


@router.post("/{slug}/scan")
async def scan_tool(
    slug: str,
    body: ToolScanRequest,
    request: Request,
    user=Depends(get_current_user),
    _maintenance=Depends(check_maintenance),
):
    ngmx_service.tool(slug)  # slug ที่ไม่รู้จัก = 404 ก่อนแตะ credential

    # ฟีเจอร์ฟรีที่รับ email/password = เครื่องมือลองรหัสชั้นดีถ้าไม่คุม จึงจำกัด
    # ทั้งรายผู้ใช้และราย IP เหมือนหน้าตรวจไอดี/จัดการเพื่อน
    meta = client_meta(request)
    rate_limiter.check(f"tool_scan:user:{user['id']}", limit=30, window_seconds=3600)
    rate_limiter.check(f"tool_scan:ip:{meta.get('ip_address')}", limit=60, window_seconds=3600)

    email, password = await saved_account_service.resolve(
        user["id"], email=body.email, password=body.password, account_id=body.account_id
    )
    return await ngmx_service.scan(slug, email, password)


def _build_params(slug: str, raw: Any, email: str, password: str) -> dict[str, Any]:
    """ตรวจ params ของแต่ละเครื่องมือแล้วประกอบเป็นรูปที่ ngmx รับ

    ไม่ forward ก้อนที่ผู้ใช้ส่งมาดิบ ๆ — ฝั่ง ngmx มีฟิลด์อื่นที่เราไม่ได้ตั้งใจ
    เปิดให้ใช้ และ treasures ของเขารับเป็น "สตริง JSON" ไม่ใช่ array
    """
    if not isinstance(raw, dict):
        raw = {}
    base = {"email": email, "password": password}

    if slug == "powder":
        p = PowderRunParams(**raw)
        return {**base, "powder": p.powder}

    if slug == "giftbox":
        g = GiftBoxRunParams(**raw)
        return {**base, "open_all": g.open_all, "boxes": g.boxes}

    t = TreasureRunParams(**raw)
    return {
        **base,
        "treasures": json.dumps(
            [{"uuid": it.uuid, "group_seq": it.group_seq} for it in t.treasures]
        ),
        "target_plus": t.target_plus,
        # ว่าง = ไม่จำกัด (ดูหมายเหตุใน TreasureRunParams)
        "budget": t.budget if t.budget else "",
    }


@ws_router.websocket("/ws/tools/{slug}")
async def ws_tool(websocket: WebSocket, slug: str, token: str = Query(...)):
    # import ตรงนี้กันวงกลม: websocket.py ก็ import จาก routes เหมือนกัน
    from api.routes.websocket import _user_from_token

    try:
        user = await _user_from_token(token)
    except Exception:
        await websocket.close(code=4401)
        return

    try:
        ngmx_service.tool(slug)
    except NgmxError:
        await websocket.close(code=4404)
        return

    await websocket.accept()
    try:
        # ข้อความแรกคือคำสั่งงาน: บัญชี (account_id หรือ email+password) + params
        opening = json.loads(await websocket.receive_text())
        if not isinstance(opening, dict):
            raise ValueError("bad opening frame")
    except (WebSocketDisconnect, ValueError, TypeError):
        await websocket.close(code=4400)
        return

    try:
        await assert_not_in_maintenance()
        ip = (websocket.client.host if websocket.client else "") or "unknown"
        rate_limiter.check(f"tool_run:user:{user['id']}", limit=30, window_seconds=3600)
        rate_limiter.check(f"tool_run:ip:{ip}", limit=60, window_seconds=3600)

        email, password = await saved_account_service.resolve(
            user["id"],
            email=opening.get("email"),
            password=opening.get("password"),
            account_id=opening.get("account_id"),
        )
        params = _build_params(slug, opening.get("params"), email, password)
    except ValidationError:
        await _send_error(websocket, "ค่าที่ส่งมาไม่ถูกต้อง กรุณาตั้งค่าใหม่อีกครั้ง")
        return
    except AppError as e:
        await _send_error(websocket, e.message)
        return
    except Exception:  # noqa: BLE001 -- อย่าให้ข้อความ error ดิบหลุดถึงผู้ใช้
        await _send_error(websocket, "เริ่มงานไม่สำเร็จ กรุณาลองใหม่")
        return

    try:
        async for event in ngmx_service.run(slug, params):
            await websocket.send_text(json.dumps(event, ensure_ascii=False))
    except WebSocketDisconnect:
        # ngmx_service.run ยิง cancel ให้เองตอน generator ถูกปิด
        return
    except AppError as e:
        await _send_error(websocket, e.message)
        return
    except Exception:  # noqa: BLE001 -- อย่าให้ข้อความ error ดิบหลุดถึงผู้ใช้
        await _send_error(websocket, "เกิดข้อผิดพลาดระหว่างทำงาน กรุณาลองใหม่")
        return

    await websocket.close()


async def _send_error(websocket: WebSocket, message: str) -> None:
    try:
        await websocket.send_text(json.dumps({"type": "error", "message": message},
                                             ensure_ascii=False))
        await websocket.close()
    except Exception:  # noqa: BLE001 -- ฝั่งผู้ใช้ปิดไปแล้วก็ไม่มีอะไรให้ทำต่อ
        pass
