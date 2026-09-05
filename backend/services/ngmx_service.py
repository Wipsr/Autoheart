"""Proxy ไปที่ ngmx (Pearlz-Core) สำหรับ "เช็คข้อมูลไอดี" และ "ปั๊มผงเวทมนตร์"

ทำไมต้อง proxy ไม่ดึงเกมเอง:
ข้อมูล wallet/ด่าน/PartyRun เราดึงเองจาก DevPlay ได้ (ดู heart_farm.py) แต่
"ของในคลัง" ต้องแปล stuffSeq -> ชื่อ+รูป ซึ่งอยู่ใน content bundle ของเกม ต้อง
แตก asset เอง ngmx ทำส่วนนั้นไว้แล้วและเปิดให้เรียกผ่าน /api/account/inspect
เราจึงยืมมาใช้ชั่วคราว ไฟล์นี้ตั้งใจให้เป็น "จุดต่อ ngmx จุดเดียว" — วันไหนมี
ตารางแปล seq ของเราเอง ก็สลับ service นี้ออกได้โดยไม่ต้องแตะ route/หน้าเว็บ

ปั๊มผงเวทมนตร์ (powder farm) ก็ proxy ด้วยเหตุผลเดียวกัน: งานนี้ต้องซื้อกล่อง
สมบัติในเกมแล้วย่อยเป็นผง ซึ่งเรายังไม่มีสคริปต์ของตัวเอง จึงสั่งงานผ่านคิวของ
ngmx แล้วดึงสถานะกลับมาแสดงบนหน้าเว็บเรา (ดู api/routes/powder.py)

session ของ ngmx: งานฝั่งเขาผูกกับ session cookie (crw_key) ซึ่งเป็น "บัญชี" ที่
ถือพ้อยท์/สิทธิ์ใช้ฟรี เราจึงถือ session เดียวร่วมกันทั้งระบบ (บัญชีบริการของ
Autoheart) แล้วจำว่า job ไหนเป็นของผู้ใช้คนไหนในตารางของเราเอง — ตั้ง
NGMX_SESSION_COOKIE ไว้เพื่อไม่ให้ได้บัญชีใหม่ (พ้อยท์เป็น 0) ทุกครั้งที่รีสตาร์ต

ข้อควรระวังด้านความปลอดภัย:
- รหัสผ่าน DevPlay ของผู้ใช้จะวิ่งผ่าน ngmx (เซิร์ฟเวอร์บุคคลที่สาม) นี่คือ
  ต้นทุนที่ยอมรับไว้แล้วเพื่อแลกกับการไม่ต้องแตก bundle — อย่า log รหัส อย่า
  เก็บลงฐานข้อมูล และอย่าให้มันติดไปกับข้อความ error
- endpoint inspect ของ ngmx บล็อก request ที่ไม่มี header แบบ browser (ตอบ 403)
  จึงต้องส่ง Origin/Referer/User-Agent เลียนแบบหน้าเว็บของเขา
"""
from __future__ import annotations

import asyncio
from typing import Any

import httpx

from config import get_settings
from core.exceptions import AppError

# เลียนแบบ header ที่หน้าเว็บ ngmx ยิงเอง ไม่งั้น inspect ตอบ 403 Forbidden
_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
}

_IMAGE_KINDS = {"cookie", "pet", "treasure"}

# ชื่อ cookie ที่ ngmx ใช้ผูก session (ดู POST /api/session)
_SESSION_COOKIE = "crw_key"

# tool id ฝั่ง ngmx ของ "ปั๊มผงเวทมนตร์"
POWDER_TOOL_ID = "powder_farm"

# สถานะที่ถือว่างานจบแล้ว (ตรงกับฝั่ง ngmx)
POWDER_FINAL_STATUSES = frozenset({"success", "error", "cancelled"})


class NgmxError(AppError):
    def __init__(self, message: str, status: int = 502):
        super().__init__("ngmx_failed", message, status)


class NgmxService:
    def __init__(self) -> None:
        self._image_client: httpx.AsyncClient | None = None
        self._image_lock = asyncio.Lock()
        self._job_client: httpx.AsyncClient | None = None
        self._job_lock = asyncio.Lock()

    @property
    def _base(self) -> str:
        return get_settings().ngmx_base_url.rstrip("/")

    def _origin_headers(self) -> dict[str, str]:
        return {**_BROWSER_HEADERS, "Origin": self._base, "Referer": self._base + "/"}

    async def inspect(self, email: str, password: str) -> dict[str, Any]:
        """ล็อกอินบัญชีเกมผ่าน ngmx แล้วคืนข้อมูลบัญชีทั้งก้อน (wallet/owned/…)

        ทุกครั้งเปิด session ใหม่ของตัวเอง (ngmx สร้าง guest session อัตโนมัติ
        จาก POST /api/session) เพื่อไม่ให้ผู้ใช้คนละคนใช้ session ปนกัน
        """
        email = (email or "").strip()
        if not email or not password:
            raise NgmxError("กรุณากรอกอีเมลและรหัสผ่าน", status=400)

        headers = self._origin_headers()
        try:
            async with httpx.AsyncClient(
                base_url=self._base, headers=headers, timeout=40.0
            ) as client:
                # ngmx เช็ค session cookie ก่อน — endpoint นี้แจก guest session ให้เอง
                await client.post("/api/session")
                resp = await client.post(
                    "/api/account/inspect",
                    json={"email": email, "password": password},
                )
        except httpx.HTTPError as e:
            # อย่าใส่ตัวแปรที่อาจพก payload/รหัสลงข้อความ error
            raise NgmxError(f"เชื่อมต่อบริการตรวจไอดีไม่ได้: {type(e).__name__}")

        data: dict[str, Any] = {}
        try:
            data = resp.json()
        except ValueError:
            pass

        if resp.status_code >= 400 or data.get("error"):
            # ส่งข้อความจาก ngmx ต่อถ้ามี (เช่น "รหัสผิด") ไม่งั้นบอกกลาง ๆ
            message = data.get("message") or "ตรวจข้อมูลบัญชีไม่สำเร็จ กรุณาลองใหม่"
            code = data.get("error") or f"http_{resp.status_code}"
            raise NgmxError(message, status=resp.status_code if resp.status_code >= 400 else 502)

        return data

    async def _ensure_image_client(self) -> httpx.AsyncClient:
        """client ตัวเดียวใช้ซ้ำสำหรับเสิร์ฟรูป — ถือ guest session ไว้ยาว ๆ

        รูปของ ngmx ถูกล็อกหลัง session เหมือนกัน แต่ไม่ผูกกับบัญชีผู้ใช้ จึงถือ
        session guest ตัวเดียวร่วมกันได้ (รีเฟรชเมื่อโดน 401)
        """
        client = self._image_client
        if client is None:
            client = httpx.AsyncClient(
                base_url=self._base, headers=self._origin_headers(), timeout=20.0
            )
            self._image_client = client
        # เปิด session ถ้ายังไม่มี cookie
        if not client.cookies:
            await client.post("/api/session")
        return client

    async def fetch_image(self, kind: str, tag: str) -> tuple[bytes, str]:
        """ดึงรูป asset จาก ngmx คืน (bytes, content_type) — proxy ผ่าน backend เรา

        เพราะรูปต้องมี session cookie ของ ngmx (browser ผู้ใช้ยิงตรงไม่ได้)
        """
        if kind not in _IMAGE_KINDS:
            raise NgmxError("ประเภทรูปไม่ถูกต้อง", status=400)

        async with self._image_lock:
            client = await self._ensure_image_client()
            path = f"/api/{kind}-image/{tag}.png"
            try:
                resp = await client.get(path)
                if resp.status_code == 401:
                    # session หมดอายุ — เปิดใหม่แล้วลองอีกครั้ง
                    await client.post("/api/session")
                    resp = await client.get(path)
            except httpx.HTTPError as e:
                raise NgmxError(f"โหลดรูปไม่สำเร็จ: {type(e).__name__}")

        if resp.status_code != 200:
            raise NgmxError("ไม่พบรูป", status=404)
        return resp.content, resp.headers.get("Content-Type", "image/png")

    # ── ปั๊มผงเวทมนตร์ (proxy คิวงานของ ngmx) ──────────────────────────────
    # ทุกคำขอในกลุ่มนี้วิ่งผ่าน session เดียวกัน (บัญชีบริการของเรา) เพราะ
    # ฝั่ง ngmx ผูกทั้งพ้อยท์และรายการงานไว้กับ session cookie — ใครเป็นเจ้าของ
    # งานไหน เราเก็บเองในตาราง powder_jobs

    async def _ensure_job_client(self) -> httpx.AsyncClient:
        """client ตัวเดียวที่ถือ session ของบัญชีบริการไว้ยาว ๆ

        ตั้ง NGMX_SESSION_COOKIE ไว้ = ใช้บัญชีเดิมทุกครั้งที่บูต (พ้อยท์/สิทธิ์
        ใช้ฟรีที่แอดมิน ngmx ให้ไว้ยังอยู่) ไม่ได้ตั้ง = ขอ guest session ใหม่

        ล็อกเฉพาะตอนสร้าง/ต่อ session เท่านั้น ไม่คลุมตัวคำขอ เพราะ scan/สั่งงาน
        กินเวลาหลายสิบวินาที ถ้าถือล็อกไว้ทั้งคำขอ ผู้ใช้ทุกคนจะต่อคิวกันหมด
        """
        async with self._job_lock:
            client = self._job_client
            if client is None:
                client = httpx.AsyncClient(
                    base_url=self._base, headers=self._origin_headers(), timeout=60.0
                )
                cookie = (get_settings().ngmx_session_cookie or "").strip()
                if cookie:
                    client.cookies.set(
                        _SESSION_COOKIE, cookie, domain=httpx.URL(self._base).host
                    )
                self._job_client = client
            if not client.cookies:
                await client.post("/api/session")
            return client

    async def _renew_job_session(self, client: httpx.AsyncClient) -> None:
        """ขอ session ใหม่หลังโดน 401 — ล็อกไว้ไม่ให้หลายคำขอขอพร้อมกันหลายรอบ"""
        async with self._job_lock:
            await client.post("/api/session")

    async def _job_call(
        self, method: str, path: str, json: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """ยิงคำขอด้วย session ของบัญชีบริการ + เปิด session ใหม่ให้เองเมื่อหมดอายุ"""
        client = await self._ensure_job_client()
        try:
            resp = await client.request(method, path, json=json)
            if resp.status_code == 401:
                # session หมดอายุ/ถูกเพิกถอน — เปิดใหม่แล้วลองอีกครั้ง
                await self._renew_job_session(client)
                resp = await client.request(method, path, json=json)
        except httpx.HTTPError as e:
            # อย่าใส่ตัวแปรที่อาจพก payload/รหัสลงข้อความ error
            raise NgmxError(f"เชื่อมต่อบริการปั๊มผงไม่ได้: {type(e).__name__}")

        data: dict[str, Any] = {}
        try:
            parsed = resp.json()
            if isinstance(parsed, dict):
                data = parsed
        except ValueError:
            pass

        if resp.status_code >= 400 or data.get("error"):
            message = data.get("message") or "สั่งงานปั๊มผงไม่สำเร็จ กรุณาลองใหม่"
            raise NgmxError(
                message, status=resp.status_code if resp.status_code >= 400 else 502
            )
        return data

    async def powder_scan(self, email: str, password: str) -> dict[str, Any]:
        """ล็อกอินบัญชีเกมแล้วดูเหรียญ/ผงปัจจุบัน + ราคากล่อง (ยังไม่เริ่มปั๊ม)"""
        email = (email or "").strip()
        if not email or not password:
            raise NgmxError("กรุณากรอกอีเมลและรหัสผ่าน", status=400)
        return await self._job_call(
            "POST", "/api/powder/scan", {"email": email, "password": password}
        )

    async def powder_start(self, email: str, password: str, powder: int) -> dict[str, Any]:
        """สั่งงานปั๊มผงเข้าคิวของ ngmx คืน job ที่เพิ่งสร้าง"""
        email = (email or "").strip()
        if not email or not password:
            raise NgmxError("กรุณากรอกอีเมลและรหัสผ่าน", status=400)
        if powder <= 0:
            raise NgmxError("จำนวนผงที่ต้องการต้องมากกว่า 0", status=400)

        data = await self._job_call(
            "POST",
            "/api/jobs",
            {
                "tool_id": POWDER_TOOL_ID,
                "params": {"email": email, "password": password, "powder": int(powder)},
            },
        )
        job = data.get("job")
        if not isinstance(job, dict) or not job.get("id"):
            raise NgmxError("ngmx ไม่ได้คืนรหัสงานกลับมา")
        return job

    async def powder_jobs(self) -> dict[str, dict[str, Any]]:
        """รายการงานทั้งหมดของบัญชีบริการ map ตาม job id ฝั่ง ngmx

        เป็นงานของผู้ใช้ทุกคนรวมกัน (session เดียว) — ผู้เรียกต้องกรองด้วย
        เจ้าของที่บันทึกไว้ในตาราง powder_jobs เสมอ
        """
        data = await self._job_call("GET", "/api/jobs")
        jobs = data.get("jobs")
        if not isinstance(jobs, list):
            return {}
        return {str(j["id"]): j for j in jobs if isinstance(j, dict) and j.get("id")}

    async def powder_cancel(self, ngmx_job_id: str) -> None:
        await self._job_call("POST", f"/api/jobs/{ngmx_job_id}/cancel")

    async def close(self) -> None:
        if self._image_client is not None:
            await self._image_client.aclose()
            self._image_client = None
        if self._job_client is not None:
            await self._job_client.aclose()
            self._job_client = None


ngmx_service = NgmxService()
