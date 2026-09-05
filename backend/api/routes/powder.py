"""ปั๊มผงเวทมนตร์ — proxy คิวงานของ ngmx (ดู services/ngmx_service.py)

งานนี้รันอยู่ฝั่ง ngmx ทั้งหมด เราแค่ส่งคำสั่งไปแล้วดึงสถานะกลับมาแสดง สิ่งที่
เราถือไว้เองคือ "งานไหนเป็นของผู้ใช้คนไหน" (ตาราง powder_jobs) เพราะ session
ฝั่ง ngmx เป็นบัญชีบริการตัวเดียวร่วมกันทั้งระบบ รายการงานของเขาจึงปนกันทุกคน

ตอนนี้ยังไม่ตัดเครดิต (เหมือนหน้าเช็คไอดี/จัดการเพื่อน) — งานใช้เหรียญในเกมของ
ผู้ใช้เองเป็นต้นทุน ส่วนฝั่ง ngmx คิดราคาจากบัญชีบริการของเรา ถ้าวันไหนเขาเริ่ม
คิดพ้อยท์จริงจัง ค่อยมาเพิ่มการตัดเครดิตที่ start_powder_job จุดเดียว
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request

from api.dependencies import check_maintenance, client_meta, get_current_user
from api.middleware.rate_limiter import rate_limiter
from core.exceptions import NotFoundError
from core.supabase_client import get_supabase_admin
from models.schemas import PowderScanRequest, PowderStartRequest
from services.ngmx_service import POWDER_FINAL_STATUSES, ngmx_service
from services.saved_account_service import saved_account_service

router = APIRouter(prefix="/api/powder", tags=["powder"])

# คอลัมน์ที่ส่งกลับหน้าเว็บได้ทั้งหมด (ตารางนี้ไม่มีรหัสผ่านอยู่แล้ว)
_JOB_COLUMNS = (
    "id, ngmx_job_id, devplay_email, requested_powder, status, progress, "
    "status_line, delivered, error_message, created_at, updated_at"
)


def _row_out(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["devplay_email"],
        "requested_powder": row["requested_powder"],
        "status": row["status"],
        "progress": row.get("progress") or 0,
        "status_line": row.get("status_line") or "",
        "delivered": row.get("delivered") or 0,
        "error_message": row.get("error_message"),
        "created_at": row.get("created_at"),
    }


def _patch_from_ngmx(row: dict[str, Any], job: dict[str, Any]) -> dict[str, Any]:
    """แปลง job ฝั่ง ngmx เป็นคอลัมน์ของเรา คืนเฉพาะฟิลด์ที่เปลี่ยนจริง

    คืน dict ว่างเมื่อไม่มีอะไรเปลี่ยน เพื่อไม่ยิง UPDATE ทิ้งเปล่าทุกครั้งที่
    หน้าเว็บ poll (แล้ว updated_at ก็จะไม่ถูกดันโดยไม่มีเหตุ)
    """
    error = job.get("error") if isinstance(job.get("error"), dict) else {}
    patch = {
        "status": str(job.get("status") or row["status"]),
        "progress": int(job.get("progress") or 0),
        # ngmx ส่ง status_line มาเฉพาะตอนมีอะไรอัปเดต — ว่างแปลว่า "เหมือนเดิม"
        # ไม่ใช่ "ล้างทิ้ง" ไม่งั้นบรรทัดสถานะจะกะพริบหายทุกครั้งที่ poll
        "status_line": str(job.get("status_line") or job.get("step") or "")
        or row.get("status_line"),
        "delivered": int(job.get("delivered") or 0),
        "error_message": (error.get("message") or None) if error else None,
    }
    return {k: v for k, v in patch.items() if row.get(k) != v}


async def _sync(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """อัปเดตสถานะงานที่ยังไม่จบจาก ngmx แล้วคืนแถวล่าสุด

    ดึงรายการงานฝั่ง ngmx ครั้งเดียวต่อการเรียกหนึ่งครั้ง ไม่ว่าจะมีกี่งาน
    ถ้าคุยกับ ngmx ไม่ได้ ก็คืนสถานะล่าสุดที่เก็บไว้แทนการโยน error ทิ้งทั้งหน้า
    """
    pending = [r for r in rows if r["status"] not in POWDER_FINAL_STATUSES]
    if not pending:
        return rows

    try:
        remote = await ngmx_service.powder_jobs()
    except Exception:
        return rows

    db = get_supabase_admin()
    for row in pending:
        job = remote.get(str(row["ngmx_job_id"]))
        if not job:
            # ngmx ลบงานที่จบแล้วทิ้งได้ — ไม่รู้ผลก็คงสถานะเดิมไว้ ไม่เดาแทนเขา
            continue
        patch = _patch_from_ngmx(row, job)
        if patch:
            db.table("powder_jobs").update(patch).eq("id", row["id"]).execute()
            row.update(patch)
    return rows


@router.post("/scan")
async def scan_account(
    body: PowderScanRequest,
    request: Request,
    user=Depends(get_current_user),
    _maintenance=Depends(check_maintenance),
):
    """ล็อกอินบัญชีเกมเพื่อดูเหรียญ/ผงก่อนตั้งเป้า (ยังไม่เริ่มปั๊ม)"""
    # endpoint ที่รับ email/password = เครื่องมือลองรหัสถ้าไม่คุม จำกัดเหมือน
    # /api/account/inspect
    meta = client_meta(request)
    rate_limiter.check(f"powder_scan:user:{user['id']}", limit=30, window_seconds=3600)
    rate_limiter.check(f"powder_scan:ip:{meta.get('ip_address')}", limit=60, window_seconds=3600)

    email, password = await saved_account_service.resolve(
        user["id"], email=body.email, password=body.password, account_id=body.account_id
    )
    data = await ngmx_service.powder_scan(email, password)
    # กันรหัส/อีเมลหลุดกลับไปหน้าเว็บโดยไม่ตั้งใจถ้า ngmx สะท้อน params กลับมา
    data.pop("password", None)
    return data


@router.post("/start")
async def start_powder_job(
    body: PowderStartRequest,
    user=Depends(get_current_user),
    _maintenance=Depends(check_maintenance),
):
    """สั่งงานปั๊มผงเข้าคิวของ ngmx แล้วจำไว้ว่าเป็นของผู้ใช้คนนี้"""
    rate_limiter.check(f"powder_start:user:{user['id']}", limit=20, window_seconds=3600)

    email, password = await saved_account_service.resolve(
        user["id"], email=body.email, password=body.password, account_id=body.account_id
    )
    job = await ngmx_service.powder_start(email, password, body.powder)

    db = get_supabase_admin()
    row = (
        db.table("powder_jobs")
        .insert(
            {
                "user_id": user["id"],
                "ngmx_job_id": str(job["id"]),
                "devplay_email": email,
                "requested_powder": int(body.powder),
                "status": str(job.get("status") or "queued"),
                "progress": int(job.get("progress") or 0),
                "status_line": str(job.get("status_line") or job.get("step") or "") or None,
            }
        )
        .execute()
        .data[0]
    )
    return {"ok": True, "job": _row_out(row)}


@router.get("/jobs")
async def my_powder_jobs(user=Depends(get_current_user)):
    db = get_supabase_admin()
    res = (
        db.table("powder_jobs")
        .select(_JOB_COLUMNS)
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    rows = await _sync(res.data or [])
    return [_row_out(r) for r in rows]


@router.post("/jobs/{job_id}/cancel")
async def cancel_powder_job(job_id: str, user=Depends(get_current_user)):
    db = get_supabase_admin()
    res = (
        db.table("powder_jobs")
        .select(_JOB_COLUMNS)
        .eq("id", job_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
    )
    if not res.data:
        raise NotFoundError("ไม่พบงาน")
    row = res.data[0]
    if row["status"] in POWDER_FINAL_STATUSES:
        return {"ok": False, "message": "งานนี้จบไปแล้ว"}

    await ngmx_service.powder_cancel(str(row["ngmx_job_id"]))
    # ngmx หยุดงานแบบไม่ทันที (worker เช็คธงระหว่างรอบ) สถานะจริงรอ sync รอบหน้า
    db.table("powder_jobs").update({"status_line": "ส่งคำสั่งหยุดแล้ว"}).eq(
        "id", row["id"]
    ).execute()
    return {"ok": True}
