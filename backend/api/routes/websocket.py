from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query

from api.dependencies import get_current_user
from core.security import decode_supabase_jwt
from core.supabase_client import get_supabase_admin
from services.notification_service import notification_service

router = APIRouter(tags=["websocket"])


async def _user_from_token(token: str) -> dict:
    claims = decode_supabase_jwt(token)
    user_id = claims.get("sub")
    db = get_supabase_admin()
    res = db.table("profiles").select("*").eq("id", user_id).limit(1).execute()
    if not res.data:
        raise ValueError("user not found")
    return res.data[0]


@router.websocket("/ws/jobs/{job_id}")
async def ws_job(websocket: WebSocket, job_id: str, token: str = Query(...)):
    try:
        user = await _user_from_token(token)
    except Exception:
        await websocket.close(code=4401)
        return

    db = get_supabase_admin()
    job = db.table("jobs").select("user_id").eq("id", job_id).limit(1).execute()
    if not job.data:
        await websocket.close(code=4404)
        return
    if job.data[0]["user_id"] != user["id"] and user.get("role") != "admin":
        await websocket.close(code=4403)
        return

    await notification_service.connect_job(job_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await notification_service.disconnect(websocket)


@router.websocket("/ws/queue")
async def ws_queue(websocket: WebSocket, token: str = Query(...)):
    try:
        user = await _user_from_token(token)
    except Exception:
        await websocket.close(code=4401)
        return

    await notification_service.connect_user(user["id"], websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await notification_service.disconnect(websocket)


@router.websocket("/ws/admin")
async def ws_admin(websocket: WebSocket, token: str = Query(...)):
    try:
        user = await _user_from_token(token)
    except Exception:
        await websocket.close(code=4401)
        return
    if user.get("role") != "admin":
        await websocket.close(code=4403)
        return

    await notification_service.connect_admin(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await notification_service.disconnect(websocket)


# REST profile helper
me_router = APIRouter(prefix="/api/me", tags=["me"])


@me_router.get("")
async def me(user=Depends(get_current_user)):
    return {
        "id": user["id"],
        "nickname": user.get("nickname"),
        "email": user.get("email"),
        "display_name": user.get("display_name") or user.get("nickname"),
        "role": user["role"],
        "credits": user["credits"],
        "total_spent_baht": user.get("total_spent_baht"),
        "total_jobs": user.get("total_jobs"),
    }
