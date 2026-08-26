from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request

from api.dependencies import get_admin_user
from core.exceptions import NotFoundError
from core.supabase_client import get_supabase_admin
from core.exceptions import AppError
from models.schemas import (
    AdminCreditRequest,
    AdminResetPasswordRequest,
    ProxyUpdateRequest,
    SystemSettingUpdate,
    CouponInput,
    MaintenanceInput,
    PackageInput,
    PopupInput,
    PromotionInput,
    WorkerSettingsInput,
)
from services.audit_service import audit_service
from services.admin_service import admin_service
from services.job_runner_service import job_runner_service
from services.proxy_service import proxy_service
from services.queue_service import queue_service
from services.worker_watchdog_service import worker_watchdog_service
from services.alert_service import alert_service

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _audit(admin: dict, request: Request, action: str, entity_type: str, entity_id: str | None, before=None, after=None):
    audit_service.log(
        admin["id"], action, entity_type, entity_id, before, after,
        request.client.host if request.client else None,
    )


@router.get("/overview")
async def overview(_admin=Depends(get_admin_user)):
    data = admin_service.overview()
    data["queue_paused"] = queue_service.is_paused()
    data["current_job_id"] = job_runner_service.current_job_id
    data["strategy"] = queue_service.get_strategy()
    return data


@router.get("/users")
async def list_users(q: str | None = None, limit: int = 50, offset: int = 0, _admin=Depends(get_admin_user)):
    return admin_service.list_users(limit=limit, offset=offset, q=q)


@router.get("/users/{user_id}")
async def get_user(user_id: str, _admin=Depends(get_admin_user)):
    user = admin_service.get_user(user_id)
    if not user:
        raise NotFoundError("ไม่พบผู้ใช้")
    db = get_supabase_admin()
    jobs = (
        db.table("jobs")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
        .data
    )
    topups = (
        db.table("topup_redemptions")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
        .data
    )
    return {"user": user, "jobs": jobs or [], "topups": topups or []}


@router.post("/users/{user_id}/ban")
async def ban_user(user_id: str, reason: str = "", _admin=Depends(get_admin_user)):
    return admin_service.set_ban(user_id, True, reason or "Banned by admin")


@router.post("/users/{user_id}/unban")
async def unban_user(user_id: str, _admin=Depends(get_admin_user)):
    return admin_service.set_ban(user_id, False, None)


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    body: AdminResetPasswordRequest,
    request: Request,
    admin=Depends(get_admin_user),
):
    db = get_supabase_admin()
    profile = db.table("profiles").select("id, nickname, email").eq("id", user_id).limit(1).execute()
    if not profile.data:
        raise NotFoundError("ไม่พบผู้ใช้")
    before = {"nickname": profile.data[0].get("nickname")}
    try:
        db.auth.admin.update_user_by_id(user_id, {"password": body.password})
    except Exception as e:
        raise AppError("reset_password_failed", f"รีเซ็ตรหัสผ่านไม่สำเร็จ: {e}", 400) from e
    _audit(
        admin,
        request,
        "reset_password",
        "user",
        user_id,
        before,
        {"nickname": profile.data[0].get("nickname")},
    )
    return {"ok": True}


@router.get("/jobs")
async def list_jobs(status: str | None = None, limit: int = 50, offset: int = 0, _admin=Depends(get_admin_user)):
    return admin_service.list_jobs(status=status, limit=limit, offset=offset)


@router.get("/jobs/{job_id}")
async def job_detail(job_id: str, _admin=Depends(get_admin_user)):
    db = get_supabase_admin()
    job = db.table("jobs").select("*").eq("id", job_id).limit(1).execute()
    if not job.data:
        raise NotFoundError("ไม่พบงาน")
    logs = (
        db.table("job_logs")
        .select("*")
        .eq("job_id", job_id)
        .order("created_at")
        .limit(1000)
        .execute()
        .data
    )
    return {"job": queue_service.enrich_job_wait(job.data[0]), "logs": logs or []}


@router.post("/jobs/{job_id}/cancel")
async def admin_cancel(job_id: str, refund: bool = True, _admin=Depends(get_admin_user)):
    db = get_supabase_admin()
    job = db.table("jobs").select("*").eq("id", job_id).limit(1).execute()
    if not job.data:
        raise NotFoundError("ไม่พบงาน")
    j = job.data[0]
    if (
        refund
        and not j.get("credits_refunded")
        and j["status"] in ("queued", "validating", "processing", "failed")
    ):
        db.rpc(
            "credit_user_hearts",
            {"p_user_id": j["user_id"], "p_hearts": j["target_hearts"], "p_baht": 0},
        ).execute()
        db.table("jobs").update({"credits_refunded": True}).eq("id", job_id).execute()
    db.table("jobs").update(
        {"status": "cancelled", "queue_position": None, "progress_message": "ยกเลิกโดยแอดมิน"}
    ).eq("id", job_id).execute()
    queue_service.resequence()
    return {"ok": True}


@router.post("/jobs/{job_id}/retry")
async def admin_retry(job_id: str, _admin=Depends(get_admin_user)):
    db = get_supabase_admin()
    job = db.table("jobs").select("*").eq("id", job_id).limit(1).execute()
    if not job.data:
        raise NotFoundError("ไม่พบงาน")
    j = job.data[0]
    db.table("jobs").update(
        {
            "status": "queued",
            "error_message": None,
            "progress_percent": 0,
            "hearts_collected": 0,
            "progress_message": "รีทรายโดยแอดมิน — อยู่ในคิว",
            "retry_count": int(j.get("retry_count") or 0) + 1,
            "attempt_count": 0,
            "next_retry_at": None,
            "last_heartbeat_at": None,
            "failure_category": None,
            "completed_at": None,
            "started_at": None,
        }
    ).eq("id", job_id).execute()
    queue_service.resequence()
    return {"ok": True}


@router.post("/queue/pause")
async def pause_queue(_admin=Depends(get_admin_user)):
    queue_service.pause_queue()
    return {"ok": True, "paused": True}


@router.post("/queue/resume")
async def resume_queue(_admin=Depends(get_admin_user)):
    queue_service.resume_queue()
    return {"ok": True, "paused": False}


@router.post("/queue/resequence")
async def resequence(_admin=Depends(get_admin_user)):
    queue_service.resequence()
    return {"ok": True, "queued": queue_service.get_queued_jobs()}


@router.get("/worker/health")
async def worker_health(_admin=Depends(get_admin_user)):
    db = get_supabase_admin()
    delayed = (
        db.table("jobs").select("id", count="exact").eq("status", "queued").not_.is_(
            "next_retry_at", "null"
        ).execute()
    )
    failed = db.table("jobs").select("id", count="exact").in_("status", ["failed", "refunded"]).execute()
    return {
        **worker_watchdog_service.status(),
        "delayed_retries": delayed.count or 0,
        "failed_jobs": failed.count or 0,
    }


@router.post("/worker/scan")
async def scan_worker(_admin=Depends(get_admin_user)):
    return await worker_watchdog_service.scan()


@router.get("/worker/alerts")
async def worker_alerts(limit: int = 100, _admin=Depends(get_admin_user)):
    return (
        get_supabase_admin()
        .table("alert_events")
        .select("*")
        .order("created_at", desc=True)
        .limit(min(limit, 200))
        .execute()
        .data
        or []
    )


@router.get("/worker/events")
async def worker_events(limit: int = 100, _admin=Depends(get_admin_user)):
    return (
        get_supabase_admin()
        .table("worker_health_events")
        .select("*")
        .order("created_at", desc=True)
        .limit(min(limit, 200))
        .execute()
        .data
        or []
    )


@router.put("/worker/settings")
async def update_worker_settings(body: WorkerSettingsInput, request: Request, admin=Depends(get_admin_user)):
    values = {
        "worker_stuck_timeout_seconds": body.stuck_timeout_seconds,
        "worker_watchdog_interval_seconds": body.watchdog_interval_seconds,
        "worker_retry_base_delay_seconds": body.retry_base_delay_seconds,
        "worker_retry_max_attempts": body.retry_max_attempts,
        "telegram_alert_cooldown_seconds": body.telegram_alert_cooldown_seconds,
    }
    for key, value in values.items():
        admin_service.update_setting(key, str(value), admin["id"])
    _audit(admin, request, "update", "worker_settings", None, after=values)
    return {"ok": True, **values}


@router.post("/worker/test-alert")
async def test_worker_alert(_admin=Depends(get_admin_user)):
    await alert_service.send(
        "manual-telegram-test",
        "Autoheart Telegram test",
        "Telegram alerts are configured and reachable.",
        "info",
    )
    return {"ok": True}


@router.get("/topups")
async def list_topups(status: str | None = None, limit: int = 50, offset: int = 0, _admin=Depends(get_admin_user)):
    return admin_service.list_topups(status=status, limit=limit, offset=offset)


@router.post("/topups/{topup_id}/credit")
async def manual_credit(topup_id: str, body: AdminCreditRequest, admin=Depends(get_admin_user)):
    db = get_supabase_admin()
    res = db.table("topup_redemptions").select("*").eq("id", topup_id).limit(1).execute()
    if not res.data:
        raise NotFoundError("ไม่พบรายการเติมเงิน")
    t = res.data[0]
    if t.get("credit_status") == "credited":
        return {"ok": False, "message": "เครดิตไปแล้ว"}

    pkg = db.table("packages").select("*").eq("id", t["package_id"]).limit(1).execute().data[0]
    hearts = int(pkg["hearts"]) * int(t.get("quantity") or 1)
    amount = float(t.get("amount_baht") or pkg["price_baht"]) * int(t.get("quantity") or 1)

    db.rpc(
        "credit_user_hearts",
        {"p_user_id": t["user_id"], "p_hearts": hearts, "p_baht": amount},
    ).execute()
    updated = (
        db.table("topup_redemptions")
        .update(
            {
                "status": "credited",
                "credit_status": "credited",
                "hearts_credited": hearts,
                "admin_credited_by": admin["id"],
                "admin_credited_at": datetime.now(timezone.utc).isoformat(),
                "admin_note": body.note,
            }
        )
        .eq("id", topup_id)
        .execute()
        .data[0]
    )
    return updated


@router.get("/packages")
async def list_packages(_admin=Depends(get_admin_user)):
    # แอดมินต้องเห็นแพ็กที่ปิดขายด้วย เลยไม่กรอง is_active เหมือน /api/packages
    return (
        get_supabase_admin()
        .table("packages")
        .select("*")
        .order("sort_order")
        .order("id")
        .execute()
        .data
        or []
    )


@router.post("/packages")
async def create_package(body: PackageInput, request: Request, admin=Depends(get_admin_user)):
    db = get_supabase_admin()
    payload = body.model_dump(mode="json")
    payload["slug"] = payload["slug"].strip()
    dup = db.table("packages").select("id").eq("slug", payload["slug"]).limit(1).execute()
    if dup.data:
        raise AppError("slug_taken", f"slug '{payload['slug']}' ถูกใช้ไปแล้ว", 400)
    created = db.table("packages").insert(payload).execute().data[0]
    _audit(admin, request, "create", "package", str(created["id"]), None, created)
    return created


@router.put("/packages/{package_id}")
async def update_package(
    package_id: int, body: PackageInput, request: Request, admin=Depends(get_admin_user)
):
    db = get_supabase_admin()
    old = db.table("packages").select("*").eq("id", package_id).limit(1).execute()
    if not old.data:
        raise NotFoundError("ไม่พบแพ็กเกจ")
    payload = body.model_dump(mode="json")
    payload["slug"] = payload["slug"].strip()
    dup = (
        db.table("packages")
        .select("id")
        .eq("slug", payload["slug"])
        .neq("id", package_id)
        .limit(1)
        .execute()
    )
    if dup.data:
        raise AppError("slug_taken", f"slug '{payload['slug']}' ถูกใช้ไปแล้ว", 400)
    updated = db.table("packages").update(payload).eq("id", package_id).execute().data[0]
    _audit(admin, request, "update", "package", str(package_id), old.data[0], updated)
    return updated


@router.get("/proxy")
async def get_proxy(_admin=Depends(get_admin_user)):
    return proxy_service.get_config() or {}


@router.put("/proxy")
async def update_proxy(body: ProxyUpdateRequest, admin=Depends(get_admin_user)):
    return proxy_service.update(body.proxy_url, body.is_enabled, updated_by=admin["id"])


@router.post("/proxy/test")
async def test_proxy(_admin=Depends(get_admin_user)):
    return await proxy_service.test_proxy()


@router.get("/settings")
async def get_settings(_admin=Depends(get_admin_user)):
    return admin_service.get_settings()


@router.put("/settings/{key}")
async def update_setting(key: str, body: SystemSettingUpdate, admin=Depends(get_admin_user)):
    return admin_service.update_setting(key, body.value, updated_by=admin["id"])


@router.get("/maintenance")
async def get_maintenance(_admin=Depends(get_admin_user)):
    rows = admin_service.get_settings()
    values = {r["key"]: r["value"] for r in rows}
    return {
        "enabled": values.get("maintenance_mode", "false") == "true",
        "message": values.get("maintenance_message", ""),
        "eta": values.get("maintenance_eta", ""),
        "banner_enabled": values.get("site_banner_enabled", "false") == "true",
        "banner_text": values.get("site_banner_text", ""),
    }


@router.put("/maintenance")
async def update_maintenance(body: MaintenanceInput, request: Request, admin=Depends(get_admin_user)):
    before = await get_maintenance(admin)
    values = {
        "maintenance_mode": str(body.enabled).lower(),
        "maintenance_message": body.message,
        "maintenance_eta": body.eta,
        "site_banner_enabled": str(body.banner_enabled).lower(),
        "site_banner_text": body.banner_text,
    }
    for key, value in values.items():
        admin_service.update_setting(key, value, admin["id"])
    _audit(admin, request, "update", "maintenance", None, before, values)
    return await get_maintenance(admin)


@router.get("/promotions")
async def list_promotions(_admin=Depends(get_admin_user)):
    return get_supabase_admin().table("promotions").select("*").order("created_at", desc=True).execute().data or []


@router.put("/promotions/{promotion_id}")
async def update_promotion(promotion_id: str, body: PromotionInput, request: Request, admin=Depends(get_admin_user)):
    db = get_supabase_admin()
    old = db.table("promotions").select("*").eq("id", promotion_id).limit(1).execute()
    if not old.data:
        raise NotFoundError("ไม่พบโปรโมชัน")
    payload = body.model_dump(mode="json")
    updated = db.table("promotions").update(payload).eq("id", promotion_id).execute().data[0]
    _audit(admin, request, "update", "promotion", promotion_id, old.data[0], updated)
    return updated


@router.get("/promotions/{promotion_id}/claims")
async def promotion_claims(promotion_id: str, _admin=Depends(get_admin_user)):
    return get_supabase_admin().table("promotion_claims").select("*").eq("promotion_id", promotion_id).order("created_at", desc=True).execute().data or []


@router.get("/coupons")
async def list_coupons(_admin=Depends(get_admin_user)):
    return get_supabase_admin().table("coupons").select("*").order("created_at", desc=True).execute().data or []


@router.post("/coupons")
async def create_coupon(body: CouponInput, request: Request, admin=Depends(get_admin_user)):
    payload = body.model_dump(mode="json")
    payload["code"] = payload["code"].strip().upper()
    created = get_supabase_admin().table("coupons").insert(payload).execute().data[0]
    _audit(admin, request, "create", "coupon", created["id"], None, created)
    return created


@router.put("/coupons/{coupon_id}")
async def update_coupon(coupon_id: str, body: CouponInput, request: Request, admin=Depends(get_admin_user)):
    db = get_supabase_admin()
    old = db.table("coupons").select("*").eq("id", coupon_id).limit(1).execute()
    if not old.data:
        raise NotFoundError("ไม่พบคูปอง")
    payload = body.model_dump(mode="json")
    payload["code"] = payload["code"].strip().upper()
    updated = db.table("coupons").update(payload).eq("id", coupon_id).execute().data[0]
    _audit(admin, request, "update", "coupon", coupon_id, old.data[0], updated)
    return updated


@router.get("/popups")
async def list_popups(_admin=Depends(get_admin_user)):
    return get_supabase_admin().table("site_popups").select("*").order("priority", desc=True).execute().data or []


@router.post("/popups")
async def create_popup(body: PopupInput, request: Request, admin=Depends(get_admin_user)):
    created = get_supabase_admin().table("site_popups").insert(body.model_dump(mode="json")).execute().data[0]
    _audit(admin, request, "create", "popup", created["id"], None, created)
    return created


@router.put("/popups/{popup_id}")
async def update_popup(popup_id: str, body: PopupInput, request: Request, admin=Depends(get_admin_user)):
    db = get_supabase_admin()
    old = db.table("site_popups").select("*").eq("id", popup_id).limit(1).execute()
    if not old.data:
        raise NotFoundError("ไม่พบ Popup")
    updated = db.table("site_popups").update(body.model_dump(mode="json")).eq("id", popup_id).execute().data[0]
    _audit(admin, request, "update", "popup", popup_id, old.data[0], updated)
    return updated


@router.get("/audit-logs")
async def audit_logs(limit: int = 100, _admin=Depends(get_admin_user)):
    return get_supabase_admin().table("admin_audit_logs").select("*").order("created_at", desc=True).limit(min(limit, 200)).execute().data or []
