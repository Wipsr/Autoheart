from __future__ import annotations

from fastapi import APIRouter, Depends

from api.dependencies import check_maintenance, get_current_user
from core.exceptions import InsufficientCreditsError, NotFoundError
from core.security import encrypt_password
from core.supabase_client import get_supabase_admin
from models.schemas import JobCreateRequest, JobOut
from services.devplay_auth_service import devplay_auth_service
from services.queue_service import queue_service

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/mine", response_model=list[JobOut])
async def my_jobs(user=Depends(get_current_user)):
    db = get_supabase_admin()
    res = (
        db.table("jobs")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return [queue_service.enrich_job_wait(j) for j in (res.data or [])]


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: str, user=Depends(get_current_user)):
    db = get_supabase_admin()
    res = db.table("jobs").select("*").eq("id", job_id).limit(1).execute()
    if not res.data:
        raise NotFoundError("ไม่พบงาน")
    job = res.data[0]
    if job["user_id"] != user["id"] and user.get("role") != "admin":
        raise NotFoundError("ไม่พบงาน")
    return queue_service.enrich_job_wait(job)


@router.get("/{job_id}/logs")
async def get_job_logs(job_id: str, user=Depends(get_current_user)):
    db = get_supabase_admin()
    job = db.table("jobs").select("user_id").eq("id", job_id).limit(1).execute()
    if not job.data:
        raise NotFoundError("ไม่พบงาน")
    if job.data[0]["user_id"] != user["id"] and user.get("role") != "admin":
        raise NotFoundError("ไม่พบงาน")
    logs = (
        db.table("job_logs")
        .select("*")
        .eq("job_id", job_id)
        .order("created_at")
        .limit(500)
        .execute()
    )
    return logs.data or []


@router.post("/create")
async def create_jobs(
    body: JobCreateRequest,
    user=Depends(get_current_user),
    _maintenance=Depends(check_maintenance),
):
    """Create one or many jobs (batch). Verifies credentials, deducts credits, enqueues."""
    db = get_supabase_admin()

    # Resolve target hearts per credential
    packages_cache: dict[int, dict] = {}
    planned: list[dict] = []
    for cred in body.credentials:
        package_id = cred.package_id or body.package_id
        target = cred.target_hearts or body.target_hearts
        if package_id and not target:
            if package_id not in packages_cache:
                pr = db.table("packages").select("*").eq("id", package_id).limit(1).execute()
                if not pr.data:
                    raise NotFoundError(f"ไม่พบแพ็คเกจ id={package_id}")
                packages_cache[package_id] = pr.data[0]
            target = int(packages_cache[package_id]["hearts"])
        if not target:
            raise InsufficientCreditsError("ต้องระบุ package_id หรือ target_hearts")
        planned.append(
            {
                "email": cred.email.strip(),
                "password": cred.password,
                "package_id": package_id,
                "target_hearts": int(target),
            }
        )

    total_hearts = sum(p["target_hearts"] for p in planned)
    profile = db.table("profiles").select("credits").eq("id", user["id"]).limit(1).execute().data[0]
    if int(profile["credits"]) < total_hearts:
        raise InsufficientCreditsError(
            f"เครดิตไม่พอ (มี {profile['credits']} ต้องการ {total_hearts})"
        )

    # Verify all credentials first
    results = []
    for p in planned:
        vr = await devplay_auth_service.verify_credentials(p["email"], p["password"])
        results.append({**p, "verify": vr})

    invalid = [r for r in results if not r["verify"].get("valid")]
    if invalid:
        return {
            "ok": False,
            "error": "validation_failed",
            "invalid": [
                {"email": r["email"], "error_message": r["verify"].get("error_message")}
                for r in invalid
            ],
        }

    created = []
    for r in results:
        ok = db.rpc(
            "deduct_user_hearts",
            {"p_user_id": user["id"], "p_hearts": r["target_hearts"]},
        ).execute()
        # supabase-py may return data True/False
        deducted = ok.data
        if deducted is False or deducted == [False]:
            raise InsufficientCreditsError("เครดิตไม่พอระหว่างสร้างงาน")

        row = {
            "user_id": user["id"],
            "package_id": r["package_id"],
            "devplay_email": r["email"],
            "devplay_password_encrypted": encrypt_password(r["password"]),
            "target_hearts": r["target_hearts"],
            "status": "queued",
            "estimated_duration_minutes": max(1, int(r["target_hearts"] / 50) + 1),
            "progress_message": "อยู่ในคิว",
        }
        job = db.table("jobs").insert(row).execute().data[0]
        created.append(job)

    queue_service.resequence()
    # Refresh with positions + wait
    out = []
    for j in created:
        fresh = db.table("jobs").select("*").eq("id", j["id"]).limit(1).execute().data[0]
        out.append(queue_service.enrich_job_wait(fresh))

    return {"ok": True, "jobs": out, "count": len(out)}


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str, user=Depends(get_current_user)):
    db = get_supabase_admin()
    res = db.table("jobs").select("*").eq("id", job_id).limit(1).execute()
    if not res.data:
        raise NotFoundError("ไม่พบงาน")
    job = res.data[0]
    if job["user_id"] != user["id"] and user.get("role") != "admin":
        raise NotFoundError("ไม่พบงาน")
    if job["status"] not in ("queued", "validating"):
        return {"ok": False, "message": "ยกเลิกได้เฉพาะงานที่ยังอยู่ในคิว"}

    # Refund credits
    db.rpc(
        "credit_user_hearts",
        {"p_user_id": job["user_id"], "p_hearts": job["target_hearts"], "p_baht": 0},
    ).execute()
    db.table("jobs").update(
        {"status": "cancelled", "queue_position": None, "progress_message": "ยกเลิกแล้ว"}
    ).eq("id", job_id).execute()
    queue_service.resequence()
    return {"ok": True}
