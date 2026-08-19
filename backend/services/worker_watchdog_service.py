"""Background recovery and health monitoring for the single worker."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from config import get_settings
from core.supabase_client import get_supabase_admin
from services.alert_service import alert_service
from services.job_runner_service import job_runner_service
from services.queue_service import queue_service


class WorkerWatchdogService:
    def __init__(self) -> None:
        self.db = get_supabase_admin()
        self._task: Optional[asyncio.Task] = None
        self._stop = asyncio.Event()
        self._last_heartbeat: Optional[str] = None

    def start_background(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._loop())

    async def stop_background(self) -> None:
        self._stop.set()
        if self._task:
            await asyncio.wait([self._task], timeout=5)
        self._record("stopped", "healthy", "Worker watchdog stopped")

    def _setting_int(self, key: str, default: int) -> int:
        try:
            row = self.db.table("system_settings").select("value").eq("key", key).limit(1).execute()
            return int((row.data or [{}])[0].get("value") or default)
        except Exception:
            return default

    def _record(self, event_type: str, status: str, message: str, details: dict[str, Any] | None = None) -> None:
        self.db.table("worker_health_events").insert(
            {
                "event_type": event_type,
                "status": status,
                "message": message,
                "details": details or {},
            }
        ).execute()

    async def _loop(self) -> None:
        self._record("started", "healthy", "Worker watchdog started")
        while not self._stop.is_set():
            try:
                await self.scan()
            except Exception as exc:
                self._record("loop_error", "warning", f"Watchdog scan failed: {exc}")
                await alert_service.send("watchdog-loop", "Worker watchdog error", str(exc), "warning")
            await asyncio.sleep(
                self._setting_int(
                    "worker_watchdog_interval_seconds",
                    get_settings().worker_watchdog_interval_seconds,
                )
            )

    async def scan(self) -> dict[str, int]:
        timeout = self._setting_int(
            "worker_stuck_timeout_seconds", get_settings().worker_stuck_timeout_seconds
        )
        cutoff = (datetime.now(timezone.utc) - timedelta(seconds=timeout)).isoformat()
        stuck = (
            self.db.table("jobs")
            .select("*")
            .eq("status", "processing")
            .lt("last_heartbeat_at", cutoff)
            .execute()
            .data
            or []
        )
        recovered = 0
        for job in stuck:
            if job_runner_service.current_job_id == job["id"]:
                await job_runner_service.terminate_current_job()
            await job_runner_service._fail(
                job["id"],
                f"Worker heartbeat timed out after {timeout} seconds",
                "stuck",
            )
            self._record("stuck_job", "critical", "Recovered stuck job", {"job_id": job["id"]})
            await alert_service.send(
                f"stuck-job:{job['id']}",
                "Stuck worker job recovered",
                f"Job {job['id']} had no heartbeat for {timeout} seconds.",
                "critical",
                {"job_id": job["id"]},
            )
            recovered += 1

        orphaned = (
            self.db.table("jobs")
            .select("*")
            .eq("status", "processing")
            .is_("last_heartbeat_at", "null")
            .execute()
            .data
            or []
        )
        for job in orphaned:
            await job_runner_service._fail(job["id"], "Orphaned job recovered after restart", "transient")
            self._record("orphan_recovery", "warning", "Recovered orphaned job", {"job_id": job["id"]})
            recovered += 1

        now = datetime.now(timezone.utc).isoformat()
        due = (
            self.db.table("jobs")
            .select("id")
            .eq("status", "queued")
            .lte("next_retry_at", now)
            .execute()
            .data
            or []
        )
        if due:
            self.db.table("jobs").update({"next_retry_at": None}).in_(
                "id", [job["id"] for job in due]
            ).execute()
            queue_service.resequence()

        self._last_heartbeat = now
        return {"stuck_recovered": recovered, "retries_released": len(due)}

    def status(self) -> dict[str, Any]:
        latest = (
            self.db.table("worker_health_events")
            .select("*")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        return {
            "watchdog_running": bool(self._task and not self._task.done()),
            "watchdog_heartbeat_at": self._last_heartbeat,
            "current_job_id": job_runner_service.current_job_id,
            "latest_event": latest[0] if latest else None,
        }


worker_watchdog_service = WorkerWatchdogService()
