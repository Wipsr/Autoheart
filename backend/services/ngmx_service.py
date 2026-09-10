"""Proxy ไปที่ ngmx (Pearlz-Core) สำหรับ "เช็คข้อมูลไอดี" + เครื่องมือฟรี 3 ตัว

เครื่องมือที่ยืมมา: ปั๊มผงเวทมนตร์ / เปิดกล่องของขวัญ / ตี + สมบัติ
(ดู TOOLS ท้ายไฟล์) — ทั้งสามตัวฝั่ง ngmx คิดราคา 0 จึงรันด้วย guest session
ของเราเองได้ ไม่ต้องมีบัญชี/พ้อยท์

ทำไมต้อง proxy ไม่ดึงเกมเอง:
ข้อมูล wallet/ด่าน/PartyRun เราดึงเองจาก DevPlay ได้ (ดู heart_farm.py) แต่
"ของในคลัง" ต้องแปล stuffSeq -> ชื่อ+รูป ซึ่งอยู่ใน content bundle ของเกม ต้อง
แตก asset เอง ngmx ทำส่วนนั้นไว้แล้วและเปิดให้เรียกผ่าน /api/account/inspect
เราจึงยืมมาใช้ชั่วคราว ไฟล์นี้ตั้งใจให้เป็น "จุดต่อ ngmx จุดเดียว" — วันไหนมี
ตารางแปล seq ของเราเอง ก็สลับ service นี้ออกได้โดยไม่ต้องแตะ route/หน้าเว็บ

ข้อควรระวังด้านความปลอดภัย:
- รหัสผ่าน DevPlay ของผู้ใช้จะวิ่งผ่าน ngmx (เซิร์ฟเวอร์บุคคลที่สาม) นี่คือ
  ต้นทุนที่ยอมรับไว้แล้วเพื่อแลกกับการไม่ต้องแตก bundle — อย่า log รหัส อย่า
  เก็บลงฐานข้อมูล และอย่าให้มันติดไปกับข้อความ error
- endpoint inspect ของ ngmx บล็อก request ที่ไม่มี header แบบ browser (ตอบ 403)
  จึงต้องส่ง Origin/Referer/User-Agent เลียนแบบหน้าเว็บของเขา
"""
from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
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

# สถานะที่แปลว่า "งานจบแล้ว" ฝั่ง ngmx — เจอแล้วปิด stream ได้
_TERMINAL = {"success", "error", "cancelled"}


@dataclass(frozen=True)
class NgmxTool:
    """เครื่องมือฝั่ง ngmx หนึ่งตัว — ผูก slug ที่หน้าเว็บเราใช้เข้ากับ id/พาธของเขา"""

    slug: str          # slug ที่ route/หน้าเว็บของเราใช้ (powder / giftbox / treasure)
    tool_id: str       # tool_id ฝั่ง ngmx ที่ต้องส่งไปกับ POST /api/jobs
    scan_path: str     # endpoint "สแกนก่อนสั่ง" ของเขา
    name: str
    unit_label: str


# ลำดับในนี้คือลำดับที่หน้าเว็บเอาไปโชว์
TOOLS: dict[str, NgmxTool] = {
    t.slug: t
    for t in (
        NgmxTool("powder", "powder_farm", "/api/powder/scan", "ปั๊มผงเวทมนตร์", "ผง"),
        NgmxTool("giftbox", "gift_box", "/api/giftbox/scan", "เปิดกล่องของขวัญ", "กล่อง"),
        NgmxTool("treasure", "treasure_upgrade", "/api/treasure/scan", "ตี + สมบัติ", "ชิ้น"),
    )
}


class NgmxError(AppError):
    def __init__(self, message: str, status: int = 502):
        super().__init__("ngmx_failed", message, status)


class NgmxService:
    def __init__(self) -> None:
        self._image_client: httpx.AsyncClient | None = None
        self._image_lock = asyncio.Lock()

    @property
    def _base(self) -> str:
        return get_settings().ngmx_base_url.rstrip("/")

    def _origin_headers(self) -> dict[str, str]:
        return {**_BROWSER_HEADERS, "Origin": self._base, "Referer": self._base + "/"}

    @staticmethod
    def _unwrap(resp: httpx.Response, fallback: str) -> dict[str, Any]:
        """แปลง response ของ ngmx เป็น dict — ถ้าเป็น error ให้โยนข้อความของเขาต่อ"""
        data: dict[str, Any] = {}
        try:
            parsed = resp.json()
            if isinstance(parsed, dict):
                data = parsed
        except ValueError:
            pass

        if resp.status_code >= 400 or data.get("error"):
            # ส่งข้อความจาก ngmx ต่อถ้ามี (เช่น "รหัสผิด") ไม่งั้นบอกกลาง ๆ
            message = data.get("message") or fallback
            raise NgmxError(message, status=resp.status_code if resp.status_code >= 400 else 502)
        return data

    def _guest_client(self, timeout: httpx.Timeout | float = 40.0) -> httpx.AsyncClient:
        """client ใหม่ต่อหนึ่งคำขอ — ผู้ใช้คนละคนต้องไม่ใช้ session ปนกัน"""
        return httpx.AsyncClient(
            base_url=self._base, headers=self._origin_headers(), timeout=timeout
        )

    async def inspect(self, email: str, password: str) -> dict[str, Any]:
        """ล็อกอินบัญชีเกมผ่าน ngmx แล้วคืนข้อมูลบัญชีทั้งก้อน (wallet/owned/…)

        ทุกครั้งเปิด session ใหม่ของตัวเอง (ngmx สร้าง guest session อัตโนมัติ
        จาก POST /api/session) เพื่อไม่ให้ผู้ใช้คนละคนใช้ session ปนกัน
        """
        return await self._login_call(
            "/api/account/inspect", email, password,
            fallback="ตรวจข้อมูลบัญชีไม่สำเร็จ กรุณาลองใหม่",
            conn_error="เชื่อมต่อบริการตรวจไอดีไม่ได้",
        )

    async def scan(self, slug: str, email: str, password: str) -> dict[str, Any]:
        """สแกนบัญชีก่อนสั่งงาน — คืนยอดปัจจุบัน (เหรียญ/ผง/กล่อง/กระเป๋าสมบัติ)

        ทุกเครื่องมือของ ngmx บังคับให้สแกนก่อน เพราะหน้าเว็บต้องรู้ว่า "ทำได้
        สูงสุดเท่าไร" ถึงจะให้ผู้ใช้ตั้งเป้าได้ เราคงลำดับเดิมไว้
        """
        tool = self.tool(slug)
        return await self._login_call(
            tool.scan_path, email, password,
            fallback=f"อ่านข้อมูลสำหรับ{tool.name}ไม่สำเร็จ กรุณาลองใหม่",
            conn_error="เชื่อมต่อบริการไม่ได้",
        )

    async def _login_call(
        self, path: str, email: str, password: str, *, fallback: str, conn_error: str
    ) -> dict[str, Any]:
        email = (email or "").strip()
        if not email or not password:
            raise NgmxError("กรุณากรอกอีเมลและรหัสผ่าน", status=400)

        try:
            async with self._guest_client() as client:
                # ngmx เช็ค session cookie ก่อน — endpoint นี้แจก guest session ให้เอง
                await client.post("/api/session")
                resp = await client.post(path, json={"email": email, "password": password})
        except httpx.HTTPError as e:
            # อย่าใส่ตัวแปรที่อาจพก payload/รหัสลงข้อความ error
            raise NgmxError(f"{conn_error}: {type(e).__name__}")

        return self._unwrap(resp, fallback)

    @staticmethod
    def tool(slug: str) -> NgmxTool:
        found = TOOLS.get(slug)
        if found is None:
            raise NgmxError("ไม่รู้จักเครื่องมือนี้", status=404)
        return found

    async def run(self, slug: str, params: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        """สั่งงานฝั่ง ngmx แล้ว "ถ่ายทอดสด" event ของเขาออกมาทีละก้อน

        ทั้ง job และ stream ผูกกับ session cookie เดียวกัน จึงต้องอยู่ใน client
        ตัวเดียวกันตลอดงาน (เปิด client ใหม่ = คนละ session = ดู job ไม่ได้)

        event ที่ yield ออกไปเป็นรูปแบบเดียวกับที่ ngmx ส่ง:
        {"type": "log"|"progress"|"status", …} โดยเราแทรก {"type": "job", …}
        เป็นก้อนแรกเพื่อบอกหน้าเว็บว่างานเริ่มแล้ว
        """
        tool = self.tool(slug)
        # งานปั๊มผงยาวได้เป็นสิบนาที — อ่าน stream ต้องไม่มี read timeout
        timeout = httpx.Timeout(40.0, read=None)

        async with self._guest_client(timeout) as client:
            try:
                await client.post("/api/session")
                resp = await client.post(
                    "/api/jobs", json={"tool_id": tool.tool_id, "params": params}
                )
            except httpx.HTTPError as e:
                raise NgmxError(f"สั่งงานไม่สำเร็จ: {type(e).__name__}")

            data = self._unwrap(resp, f"สั่ง{tool.name}ไม่สำเร็จ กรุณาลองใหม่")
            job = data.get("job") or {}
            job_id = job.get("id")
            if not job_id:
                raise NgmxError(f"สั่ง{tool.name}ไม่สำเร็จ กรุณาลองใหม่")

            yield {"type": "job", "job": self._public_job(job)}

            finished = False
            try:
                async for event in self._stream(client, job_id):
                    if event.get("type") == "status" and event.get("status") in _TERMINAL:
                        finished = True
                    yield event
            finally:
                # ผู้ใช้ปิดหน้าเว็บ/หลุดกลางคัน — อย่าปล่อยงานค้างรันบนบัญชีเขา
                if not finished:
                    await self._cancel_quietly(client, job_id)

    async def _stream(
        self, client: httpx.AsyncClient, job_id: str
    ) -> AsyncIterator[dict[str, Any]]:
        try:
            async with client.stream("GET", f"/api/jobs/{job_id}/stream") as resp:
                if resp.status_code >= 400:
                    raise NgmxError("ติดตามสถานะงานไม่ได้")
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    try:
                        event = json.loads(line[5:].strip())
                    except ValueError:
                        continue
                    if not isinstance(event, dict):
                        continue
                    if event.get("type") == "status":
                        event = {"type": "status", **self._public_job(event)}
                        yield event
                        if event.get("status") in _TERMINAL:
                            return
                        continue
                    yield event
        except httpx.HTTPError as e:
            raise NgmxError(f"การเชื่อมต่อระหว่างทำงานหลุด: {type(e).__name__}")

    async def _cancel_quietly(self, client: httpx.AsyncClient, job_id: str) -> None:
        try:
            await client.post(f"/api/jobs/{job_id}/cancel", timeout=10.0)
        except Exception:  # noqa: BLE001 -- best effort ตอนกำลังปิดงานอยู่แล้ว
            pass

    @staticmethod
    def _public_job(job: dict[str, Any]) -> dict[str, Any]:
        """คัดเฉพาะฟิลด์ที่หน้าเว็บเราใช้ — ไม่ส่งราคา/พ้อยท์/บัญชีฝั่ง ngmx ต่อ"""
        return {
            "id": job.get("id"),
            "status": job.get("status"),
            "progress": job.get("progress") or 0,
            "step": job.get("step") or "",
            "units": job.get("units") or 0,
            "delivered": job.get("delivered") or 0,
            "queue_position": job.get("queue_position") or 0,
            "result": job.get("result"),
            "error": job.get("error"),
        }

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

    async def close(self) -> None:
        if self._image_client is not None:
            await self._image_client.aclose()
            self._image_client = None


ngmx_service = NgmxService()
