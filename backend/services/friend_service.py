"""รัน friend_tool.py เป็น subprocess สำหรับฟีเจอร์จัดการเพื่อน (ฟรี ไม่ผ่านคิว)

ทำไมต้อง subprocess ไม่ import มาเรียกตรง ๆ:
heart_farm.py เปิด gRPC channel + เก็บ state ระดับโมดูล ถ้า import เข้ามาใน
โปรเซส FastAPI แล้วมีผู้ใช้หลายคนกดพร้อมกัน state จะปนกัน และ error ในนั้น
จะลาก API ทั้งตัวไปด้วย — แยกโปรเซสจบในตัวเอง ตายก็ตายแค่คำขอนั้น
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from config import get_settings
from core.exceptions import AppError

BACKEND_ROOT = Path(__file__).resolve().parent.parent

LIST_TIMEOUT_SECONDS = 90
DELETE_TIMEOUT_SECONDS = 300


class FriendToolError(AppError):
    def __init__(self, message: str, detail: Any = None):
        super().__init__("friend_tool_failed", message, 400, detail)


class FriendService:
    async def _run(self, mode: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
        settings = get_settings()
        script = BACKEND_ROOT / settings.friend_tool_script
        if not script.exists():
            raise FriendToolError(f"ไม่พบสคริปต์ {settings.friend_tool_script} บนเซิร์ฟเวอร์")

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
            raise FriendToolError(f"เริ่มเครื่องมือจัดการเพื่อนไม่ได้: {e}")

        # รหัสผ่านไปทาง stdin ไม่ใช่ argv — argv โผล่ใน `ps` ของทั้งเครื่อง
        stdin_data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(stdin_data), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise FriendToolError("เชื่อมต่อเซิร์ฟเวอร์เกมนานเกินไป กรุณาลองใหม่")

        result = self._parse(stdout)
        if result is None:
            tail = (stderr or b"").decode("utf-8", errors="replace").strip()[-400:]
            raise FriendToolError(
                "เครื่องมือจัดการเพื่อนไม่ตอบกลับ (exit %s)" % proc.returncode,
                detail=tail or None,
            )
        if not result.get("ok") and mode == "list":
            raise FriendToolError(result.get("error") or "ดำเนินการไม่สำเร็จ")
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

    async def list_friends(self, email: str, password: str) -> dict[str, Any]:
        return await self._run(
            "list", {"email": email, "password": password}, LIST_TIMEOUT_SECONDS
        )

    async def delete_friends(
        self, email: str, password: str, player_ids: list[str]
    ) -> dict[str, Any]:
        # ลบบางส่วนสำเร็จก็ยังคืน 200 พร้อมรายการที่พลาด ให้หน้าเว็บบอกผู้ใช้ได้ตรง ๆ
        # ว่าเหลืออะไรบ้าง แทนที่จะโยน error ทิ้งทั้งก้อน
        result = await self._run(
            "delete",
            {"email": email, "password": password, "player_ids": player_ids},
            DELETE_TIMEOUT_SECONDS,
        )
        if "removed" not in result:
            raise FriendToolError(result.get("error") or "ลบเพื่อนไม่สำเร็จ")
        return result


friend_service = FriendService()
