"""Subprocess manager for heart_farm.py in --api-mode."""
from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from config import get_settings
from core.security import decrypt_password
from core.supabase_client import get_supabase_admin
from services.notification_service import notification_service
from services.proxy_service import proxy_service
from services.queue_service import queue_service
from services.alert_service import alert_service
from services.reliability import classify_failure, retry_delay_seconds


BACKEND_ROOT = Path(__file__).resolve().parent.parent


class JobRunnerService:
    def __init__(self):
        self._task: Optional[asyncio.Task] = None
        self._current_job_id: Optional[str] = None
        self._current_process: Optional[asyncio.subprocess.Process] = None
        self._stop = asyncio.Event()

    @property
    def current_job_id(self) -> Optional[str]:
        return self._current_job_id

    def start_background(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._loop())

    async def stop_background(self) -> None:
        self._stop.set()
        if self._task:
            await asyncio.wait([self._task], timeout=5)

    async def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                if queue_service.is_paused():
                    await asyncio.sleep(2)
                    continue
                if queue_service.get_active_job():
                    await asyncio.sleep(2)
                    continue
                nxt = queue_service.get_next_job()
                if not nxt:
                    await asyncio.sleep(2)
                    continue
                await self.run_job(nxt["id"])
            except Exception as e:
                # Keep loop alive
                print(f"[job_runner] loop error: {e}")
                await asyncio.sleep(3)

    async def append_log(
        self,
        job_id: str,
        message: str,
        level: str = "info",
        data: dict | None = None,
        source: str = "worker",
    ) -> None:
        db = get_supabase_admin()
        db.table("job_logs").insert(
            {
                "job_id": job_id,
                "level": level,
                "message": message,
                "data": data,
                "source": source,
            }
        ).execute()
        await notification_service.broadcast_job(
            job_id,
            {
                "type": "log",
                "job_id": job_id,
                "level": level,
                "message": message,
                "data": data,
            },
        )

    async def update_progress(self, job_id: str, patch: dict[str, Any]) -> None:
        db = get_supabase_admin()
        db.table("jobs").update(patch).eq("id", job_id).execute()
        await notification_service.broadcast_job(
            job_id, {"type": "progress", "job_id": job_id, **patch}
        )

    async def run_job(self, job_id: str) -> None:
        db = get_supabase_admin()
        res = db.table("jobs").select("*").eq("id", job_id).limit(1).execute()
        if not res.data:
            return
        job = res.data[0]
        try:
            self._current_job_id = job_id
            settings = get_settings()
            script = BACKEND_ROOT / settings.heart_farm_script
            proxy = proxy_service.get_active_proxy_url()
            password = decrypt_password(job["devplay_password_encrypted"])
        except Exception as e:
            await self._fail(job_id, f"ถอดรหัสรหัสผ่านไม่ได้: {e}", "permanent")
            self._current_job_id = None
            return

        try:
            now = datetime.now(timezone.utc).isoformat()
            db.table("jobs").update(
                {
                    "status": "processing",
                    "started_at": now,
                    "last_heartbeat_at": now,
                    "next_retry_at": None,
                    "attempt_count": int(job.get("attempt_count") or 0) + 1,
                    "queue_position": None,
                    "progress_message": "กำลังเริ่ม worker...",
                }
            ).eq("id", job_id).execute()
            queue_service.resequence()
            await self.append_log(job_id, "Job started")

            env = os.environ.copy()
            env["PYTHONUNBUFFERED"] = "1"

            cmd = [
            settings.python_executable,
            str(script),
            "--api-mode",
            "--email",
            job["devplay_email"],
            "--password",
            password,
            "--target-hearts",
            str(job["target_hearts"]),
        ]
            if proxy:
                cmd.extend(["--proxy", proxy])

            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                    cwd=str(script.parent),
                    env=env,
                )
                self._current_process = proc
            except Exception as e:
                await self._fail(job_id, f"เริ่ม subprocess ไม่ได้: {e}", "transient")
                return

            assert proc.stdout is not None
            final_ok = False
            hearts_collected = 0

            while True:
                try:
                    line = await asyncio.wait_for(proc.stdout.readline(), timeout=15)
                except asyncio.TimeoutError:
                    await self._heartbeat(job_id)
                    continue
                if not line:
                    break
                text = line.decode("utf-8", errors="replace").rstrip()
                if not text:
                    continue

                await self._heartbeat(job_id)
                if text.startswith("{") and text.endswith("}"):
                    try:
                        event = json.loads(text)
                    except json.JSONDecodeError:
                        await self.append_log(job_id, text, level="info", source="stdout")
                        continue
                    await self._handle_event(job_id, event)
                    if event.get("type") == "progress":
                        hearts_collected = int(event.get("hearts_collected") or hearts_collected)
                    if event.get("type") == "done":
                        final_ok = bool(event.get("ok", True))
                        hearts_collected = int(event.get("hearts_collected") or hearts_collected)
                else:
                    await self.append_log(job_id, text, source="stdout")

            code = await proc.wait()
            if code == 0 and (final_ok or hearts_collected >= int(job["target_hearts"])):
                await self._complete(job_id, hearts_collected)
            elif code == 0:
                await self._fail(job_id, "Worker finished with ok=false", "permanent")
            else:
                message = f"Worker exited with code {code}"
                await self._fail(job_id, message, classify_failure(message))
        except Exception as e:
            await self._fail(job_id, f"Worker execution error: {e}", "transient")
        finally:
            self._current_process = None
            self._current_job_id = None

    async def _heartbeat(self, job_id: str) -> None:
        get_supabase_admin().table("jobs").update(
            {"last_heartbeat_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", job_id).execute()

    async def terminate_current_job(self) -> bool:
        proc = self._current_process
        if not proc or proc.returncode is not None:
            return False
        proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=10)
        except asyncio.TimeoutError:
            proc.kill()
        return True

    async def _handle_event(self, job_id: str, event: dict[str, Any]) -> None:
        etype = event.get("type")
        if etype == "log":
            await self.append_log(
                job_id,
                event.get("message", ""),
                level=event.get("level", "info"),
                data=event.get("data"),
                source="farm",
            )
            return

        if etype == "progress":
            collected = int(event.get("hearts_collected") or 0)
            target = int(event.get("target_hearts") or 1)
            pct = round(min(100.0, collected * 100.0 / max(target, 1)), 2)
            patch = {
                "hearts_collected": collected,
                "progress_percent": pct,
                "progress_message": event.get("message") or f"{collected}/{target}",
                "current_session": event.get("current_session"),
                "total_sessions": event.get("total_sessions"),
            }
            patch = {k: v for k, v in patch.items() if v is not None}
            await self.update_progress(job_id, patch)
            return

        if etype == "error":
            await self.append_log(
                job_id, event.get("message", "error"), level="error", data=event
            )

    async def _complete(self, job_id: str, hearts_collected: int) -> None:
        db = get_supabase_admin()
        job = db.table("jobs").select("*").eq("id", job_id).limit(1).execute().data[0]
        started = job.get("started_at")
        duration = None
        if started:
            try:
                st = datetime.fromisoformat(started.replace("Z", "+00:00"))
                duration = int((datetime.now(timezone.utc) - st).total_seconds())
            except Exception:
                duration = None
        db.table("jobs").update(
            {
                "status": "completed",
                "hearts_collected": hearts_collected,
                "progress_percent": 100,
                "progress_message": "เสร็จสมบูรณ์",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "actual_duration_seconds": duration,
                "queue_position": None,
                "devplay_password_encrypted": "",
            }
        ).eq("id", job_id).execute()
        await self.append_log(job_id, f"Completed — {hearts_collected} hearts", level="info")
        await notification_service.broadcast_job(
            job_id, {"type": "status", "job_id": job_id, "status": "completed"}
        )

    def _refund_job_credits(self, job_id: str) -> bool:
        """Refund target_hearts once when job ends in failure. Returns True if refunded."""
        db = get_supabase_admin()
        res = (
            db.table("jobs")
            .select("user_id, target_hearts, credits_refunded")
            .eq("id", job_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            return False
        job = res.data[0]
        if job.get("credits_refunded"):
            return False
        db.rpc(
            "credit_user_hearts",
            {
                "p_user_id": job["user_id"],
                "p_hearts": int(job["target_hearts"]),
                "p_baht": 0,
            },
        ).execute()
        db.table("jobs").update({"credits_refunded": True}).eq("id", job_id).execute()
        return True

    async def _fail(self, job_id: str, message: str, category: str = "permanent") -> None:
        db = get_supabase_admin()
        job_data = (
            db.table("jobs")
            .select("attempt_count, target_hearts")
            .eq("id", job_id)
            .limit(1)
            .execute()
            .data
        )
        row = job_data[0] if job_data else {}
        attempts = int(row.get("attempt_count") or 0)
        settings = get_settings()
        retry = category in ("transient", "stuck") and attempts < settings.worker_retry_max_attempts
        delay = retry_delay_seconds(attempts, settings.worker_retry_base_delay_seconds)
        next_retry = (datetime.now(timezone.utc) + timedelta(seconds=delay)).isoformat() if retry else None
        final_status = "queued" if retry else "refunded"
        update_payload: dict = {
            "status": final_status,
            "error_message": message,
            "failure_category": category,
            "next_retry_at": next_retry,
            "completed_at": None if retry else datetime.now(timezone.utc).isoformat(),
            "queue_position": None,
        }
        if not retry:
            update_payload["devplay_password_encrypted"] = ""
        db.table("jobs").update(update_payload).eq("id", job_id).execute()
        if not retry:
            refunded = self._refund_job_credits(job_id)
            if refunded:
                hearts = int(row.get("target_hearts") or 0)
                await self.append_log(
                    job_id,
                    f"คืนเครดิต {hearts} หัวใจที่หักไว้แล้ว",
                    level="info",
                )
        await self.append_log(
            job_id,
            f"{message}{f' — retry in {delay}s' if retry else ''}",
            level="error",
        )
        await notification_service.broadcast_job(
            job_id,
            {
                "type": "status",
                "job_id": job_id,
                "status": "queued" if retry else "refunded",
                "message": message,
            },
        )
        if not retry:
            await alert_service.send(
                f"job-failed:{job_id}",
                "Job failed",
                message,
                "critical" if category == "stuck" else "warning",
                {"job_id": job_id, "category": category, "attempts": attempts},
            )
        queue_service.resequence()


job_runner_service = JobRunnerService()
