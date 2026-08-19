from fastapi import APIRouter, Depends

from api.dependencies import get_current_user
from models.schemas import QueueStatusOut
from services.queue_service import queue_service

router = APIRouter(prefix="/api/queue", tags=["queue"])


@router.get("/status", response_model=QueueStatusOut)
async def queue_status(user=Depends(get_current_user)):
    active = queue_service.get_active_job()
    queued = queue_service.get_queued_jobs()
    yours = [
        queue_service.enrich_job_wait(j)
        for j in queued
        if j["user_id"] == user["id"]
    ]
    # Also include user's processing job
    if active and active["user_id"] == user["id"]:
        yours = [queue_service.enrich_job_wait(active)] + yours

    return {
        "active_job": queue_service.enrich_job_wait(active) if active else None,
        "queued_count": len(queued),
        "your_jobs": yours,
        "strategy": queue_service.get_strategy(),
    }


@router.get("/position/{job_id}")
async def queue_position(job_id: str, user=Depends(get_current_user)):
    from core.exceptions import NotFoundError
    from core.supabase_client import get_supabase_admin

    db = get_supabase_admin()
    res = db.table("jobs").select("*").eq("id", job_id).limit(1).execute()
    if not res.data:
        raise NotFoundError("ไม่พบงาน")
    job = res.data[0]
    if job["user_id"] != user["id"] and user.get("role") != "admin":
        raise NotFoundError("ไม่พบงาน")
    job = queue_service.enrich_job_wait(job)
    return {
        "job_id": job_id,
        "status": job["status"],
        "queue_position": job.get("queue_position"),
        "estimated_wait_minutes": job.get("estimated_wait_minutes"),
        "progress_percent": job.get("progress_percent"),
        "hearts_collected": job.get("hearts_collected"),
        "target_hearts": job.get("target_hearts"),
    }
