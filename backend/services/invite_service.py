"""รัน invite_tool.py เป็น subprocess สำหรับฟีเจอร์ "เชิญเพื่อน" (ฟรี ไม่ผ่านคิว)

เหตุผลที่แยกโปรเซสเหมือน friend_service.py: heart_farm.py เก็บ state ระดับ
โมดูล (gRPC channel ร่วม + PROXY_URL) ถ้า import เข้ามาใน FastAPI แล้วมีคนกด
พร้อมกัน state จะปนกัน — งานเชิญเพื่อนยิ่งชัด เพราะมันเซ็ต _PROXIES ทับของเดิม

ต่างจากงานจัดการเพื่อนตรงที่งานนี้ "สร้าง guest ใหม่" ซึ่งเป็นงานเดียวกับที่
worker ฟาร์มหัวใจแย่งใช้ rate limit ของ DevPlay อยู่ — timeout จึงยาวกว่า และ
route ที่เรียกต้องคุมจำนวนครั้งต่อชั่วโมงให้แน่นกว่าเมนูอื่น
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from config import get_settings
from core.exceptions import AppError
from services.proxy_service import proxy_service

BACKEND_ROOT = Path(__file__).resolve().parent.parent

STATUS_TIMEOUT_SECONDS = 90
# 29 guest × (สร้างบัญชี + ตั้ง referrer) ขนาน 10 เส้น ปกติจบใน 1 นาที แต่ถ้า
# proxy ช้า create_guest จะ retry 3 รอบต่อตัว — เผื่อไว้ให้จบเองก่อนถูกฆ่า
INVITE_TIMEOUT_SECONDS = 480


class InviteToolError(AppError):
    def __init__(self, message: str, detail: Any = None):
        super().__init__("invite_tool_failed", message, 400, detail)


class InviteService:
    async def _run(self, mode: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
        settings = get_settings()
        script = BACKEND_ROOT / settings.invite_tool_script
        if not script.exists():
            raise InviteToolError(f"ไม่พบสคริปต์ {settings.invite_tool_script} บนเซิร์ฟเวอร์")

        # proxy หมุน IP คือสิ่งเดียวที่กันไม่ให้ login server ปฏิเสธการสร้าง guest
        # รัวๆ — ตั้งไม่ได้ก็ยังรันต่อ (แค่มีสิทธิ์ล้มเยอะ) ไม่ควรทำให้ทั้งคำขอพัง
        try:
            proxy = proxy_service.get_active_proxy_url()
        except Exception:
            proxy = ""

        try:
            proc = await asyncio.create_subprocess_exec(
                settings.python_executable,
                str(script),
                "--mode",
                mode,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(script.parent),
            )
        except Exception as e:
            raise InviteToolError(f"เริ่มเครื่องมือเชิญเพื่อนไม่ได้: {e}")

        # รหัสผ่าน "และ proxy URL" ไปทาง stdin ไม่ใช่ argv — proxy ของเรามี
        # user:pass อยู่ในตัว URL การส่งทาง argv = โชว์ให้ทุกโปรเซสบนเครื่องเห็น
        stdin_data = json.dumps({**payload, "proxy": proxy}, ensure_ascii=False).encode("utf-8")
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(stdin_data), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise InviteToolError("งานเชิญเพื่อนใช้เวลานานเกินไป กรุณาลองใหม่ด้วยจำนวนที่น้อยลง")

        result = self._parse(stdout)
        if result is None:
            tail = (stderr or b"").decode("utf-8", errors="replace").strip()[-400:]
            raise InviteToolError(
                "เครื่องมือเชิญเพื่อนไม่ตอบกลับ (exit %s)" % proc.returncode,
                detail=tail or None,
            )
        return result

    @staticmethod
    def _parse(stdout: bytes | None) -> dict[str, Any] | None:
        """เอาบรรทัด JSON สุดท้ายของ stdout — ถ้ามีอะไรหลุดมาก่อนหน้าจะได้ไม่พัง"""
        for line in reversed((stdout or b"").decode("utf-8", errors="replace").splitlines()):
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
        return None

    async def status(self, email: str, password: str) -> dict[str, Any]:
        result = await self._run(
            "status", {"email": email, "password": password}, STATUS_TIMEOUT_SECONDS
        )
        if not result.get("ok"):
            raise InviteToolError(result.get("error") or "ดึงสถานะเชิญเพื่อนไม่สำเร็จ")
        return result

    async def invite(
        self,
        count: int,
        email: str | None = None,
        password: str | None = None,
        target_mid: str | None = None,
    ) -> dict[str, Any]:
        # เชิญได้บางส่วนก็ยังคืน 200 พร้อมจำนวนที่พลาด (เหมือน delete/accept ของ
        # เมนูเพื่อน) เพราะ guest ที่สร้างสำเร็จไปแล้วตั้ง referrer ไปแล้วจริง —
        # โยน error ทิ้งทั้งก้อนจะทำให้ผู้ใช้ไม่รู้ว่าได้ไปกี่คน แล้วกดซ้ำเกินจำเป็น
        result = await self._run(
            "invite",
            {
                "email": email or "",
                "password": password or "",
                "target_mid": target_mid or "",
                "count": int(count),
            },
            INVITE_TIMEOUT_SECONDS,
        )
        if "success" not in result:
            raise InviteToolError(result.get("error") or "เชิญเพื่อนไม่สำเร็จ")
        return result


invite_service = InviteService()
