"""Proxy ไปที่ ngmx (Pearlz-Core) สำหรับฟีเจอร์ "เช็คข้อมูลไอดี"

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

    async def close(self) -> None:
        if self._image_client is not None:
            await self._image_client.aclose()
            self._image_client = None


ngmx_service = NgmxService()
