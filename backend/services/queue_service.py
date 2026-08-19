"""Fair interleaved job queue + dynamic wait-time estimation."""
from __future__ import annotations

from typing import Any, Optional
from datetime import datetime, timezone

from config import get_settings
from core.supabase_client import get_supabase_admin


class FairQueueService:
    def __init__(self):
        self.db = get_supabase_admin()

    def _hearts_per_minute(self) -> float:
        try:
            res = (
                self.db.table("system_settings")
                .select("value")
                .eq("key", "hearts_per_minute")
                .limit(1)
                .execute()
            )
            if res.data and res.data[0].get("value"):
                return float(res.data[0]["value"])
        except Exception:
            pass
        return float(get_settings().hearts_per_minute)

    def get_strategy(self) -> str:
        res = (
            self.db.table("system_settings")
            .select("value")
            .eq("key", "queue_strategy")
            .limit(1)
            .execute()
        )
        if res.data and res.data[0].get("value"):
            return res.data[0]["value"]
        return "fair"

    def resequence(self) -> None:
        self.db.rpc("resequence_queue").execute()

    def get_active_job(self) -> Optional[dict[str, Any]]:
        res = (
            self.db.table("jobs")
            .select("*")
            .eq("status", "processing")
            .order("started_at", desc=False)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None

    def get_queued_jobs(self) -> list[dict[str, Any]]:
        res = (
            self.db.table("jobs")
            .select("*")
            .eq("status", "queued")
            .order("queue_position", desc=False)
            .execute()
        )
        return res.data or []

    def get_next_job(self) -> Optional[dict[str, Any]]:
        self.resequence()
        now = datetime.now(timezone.utc).isoformat()
        res = (
            self.db.table("jobs")
            .select("*")
            .eq("status", "queued")
            .or_(f"next_retry_at.is.null,next_retry_at.lte.{now}")
            .order("queue_position", desc=False)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None

    def calculate_dynamic_wait_time(self, target_position: int | None) -> int:
        """
        Wait minutes ≈ (remaining hearts of active + hearts of jobs ahead) / rate.
        """
        rate = self._hearts_per_minute() or 50.0
        total_remaining = 0

        active = self.get_active_job()
        if active:
            total_remaining += max(
                0, int(active["target_hearts"]) - int(active.get("hearts_collected") or 0)
            )

        if target_position is None:
            return int(total_remaining / rate) + 1 if total_remaining else 0

        ahead = [
            j
            for j in self.get_queued_jobs()
            if j.get("queue_position") is not None and j["queue_position"] < target_position
        ]
        for j in ahead:
            if not j.get("next_retry_at"):
                total_remaining += int(j["target_hearts"])

        if total_remaining <= 0:
            return 0 if not active else 1
        return int(total_remaining / rate) + 1

    def enrich_job_wait(self, job: dict[str, Any]) -> dict[str, Any]:
        pos = job.get("queue_position")
        wait = self.calculate_dynamic_wait_time(pos if job.get("status") == "queued" else None)
        if job.get("status") == "processing":
            remaining = max(0, int(job["target_hearts"]) - int(job.get("hearts_collected") or 0))
            wait = int(remaining / (self._hearts_per_minute() or 50.0)) + 1
        job = {**job, "estimated_wait_minutes": wait}
        return job

    def public_stats(self, ttl_seconds: int = 5) -> dict[str, Any]:
        """สถิติคิวรวมสำหรับหน้าแรก (ไม่มีข้อมูลส่วนบุคคล) — cache สั้น ๆ กัน DB โดนถล่ม"""
        now = datetime.now(timezone.utc).timestamp()
        cached = getattr(self, "_public_stats_cache", None)
        if cached and now - cached[0] < ttl_seconds:
            return cached[1]

        active = self.get_active_job()
        queued = self.get_queued_jobs()
        rate = self._hearts_per_minute() or 50.0

        remaining = 0
        if active:
            remaining += max(
                0, int(active["target_hearts"]) - int(active.get("hearts_collected") or 0)
            )
        remaining += sum(int(j["target_hearts"]) for j in queued)

        completed = (
            self.db.table("jobs")
            .select("id", count="exact")
            .eq("status", "completed")
            .limit(1)
            .execute()
        )

        stats = {
            "running_count": 1 if active else 0,
            "queued_count": len(queued),
            "estimated_wait_minutes": int(remaining / rate) + 1 if remaining else 0,
            "completed_jobs": completed.count or 0,
            "strategy": self.get_strategy(),
            "paused": self.is_paused(),
        }
        self._public_stats_cache = (now, stats)
        return stats

    def enqueue_jobs(self, job_ids: list[str]) -> None:
        # Ensure status queued then resequence
        for jid in job_ids:
            self.db.table("jobs").update({"status": "queued"}).eq("id", jid).execute()
        self.resequence()

    def pause_queue(self) -> None:
        self.db.table("system_settings").upsert(
            {"key": "queue_paused", "value": "true", "description": "Pause worker picking jobs"}
        ).execute()

    def resume_queue(self) -> None:
        self.db.table("system_settings").upsert(
            {"key": "queue_paused", "value": "false", "description": "Pause worker picking jobs"}
        ).execute()

    def is_paused(self) -> bool:
        res = (
            self.db.table("system_settings")
            .select("value")
            .eq("key", "queue_paused")
            .limit(1)
            .execute()
        )
        return bool(res.data and res.data[0].get("value") == "true")


queue_service = FairQueueService()
