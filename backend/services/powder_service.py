"""รัน powder_tool.py เป็น subprocess สำหรับฟีเจอร์ปั๊มผงเวทมนตร์ (ฟรี ไม่ผ่านคิว)

เหตุผลที่ต้องแยกโปรเซส เหมือน friend_service.py ทุกประการ: heart_farm.py เปิด
gRPC channel + เก็บ state ระดับโมดูล (รวมถึง channel ที่ guest ใช้ร่วมกัน) ถ้า
import เข้ามาในโปรเซส FastAPI แล้วมีผู้ใช้หลายคนกดพร้อมกัน state จะปนกัน
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from config import get_settings
from core.exceptions import AppError

BACKEND_ROOT = Path(__file__).resolve().parent.parent

STATUS_TIMEOUT_SECONDS = 90
# ปั๊มเต็มเพดาน 300 guest ต้องสร้างบัญชีใหม่ 300 ใบผ่าน proxy ที่ช้าเป็นปกติ
# ให้เวลาเผื่อยาวกว่าฟีเจอร์อื่นมาก — ตัวเครื่องมือรายงานผลบางส่วนไม่ได้ ถ้าโดน
# ตัดกลางคันจะเสีย guest ที่สร้างไปแล้วทิ้ง จึงยอมรอดีกว่าตัดไว
PUMP_TIMEOUT_SECONDS = 900


class PowderToolError(AppError):
    def __init__(self, message: str, detail: Any = None):
        super().__init__("powder_tool_failed", message, 400, detail)


class PowderService:
    async def _run(self, mode: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
        settings = get_settings()
        script = BACKEND_ROOT / settings.powder_tool_script
        if not script.exists():
            raise PowderToolError(f"ไม่พบสคริปต์ {settings.powder_tool_script} บนเซิร์ฟเวอร์")

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
            raise PowderToolError(f"เริ่มเครื่องมือปั๊มผงไม่ได้: {e}")

        # รหัสผ่านไปทาง stdin ไม่ใช่ argv — argv โผล่ใน `ps` ของทั้งเครื่อง
        stdin_data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(stdin_data), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise PowderToolError("เชื่อมต่อเซิร์ฟเวอร์เกมนานเกินไป กรุณาลองใหม่")

        result = self._parse(stdout)
        if result is None:
            tail = (stderr or b"").decode("utf-8", errors="replace").strip()[-400:]
            raise PowderToolError(
                "เครื่องมือปั๊มผงไม่ตอบกลับ (exit %s)" % proc.returncode,
                detail=tail or None,
            )
        if not result.get("ok"):
            raise PowderToolError(result.get("error") or "ดำเนินการไม่สำเร็จ")
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
        return await self._run(
            "status", {"email": email, "password": password}, STATUS_TIMEOUT_SECONDS
        )

    async def pump(self, email: str, password: str, count: int) -> dict[str, Any]:
        return await self._run(
            "pump",
            {"email": email, "password": password, "count": count},
            PUMP_TIMEOUT_SECONDS,
        )


powder_service = PowderService()
