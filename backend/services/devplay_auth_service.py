"""DevPlay credential verification (login probe before queue)."""
from __future__ import annotations

from typing import Any

import httpx

# ใช้ lc + ตารางแปล error code ชุดเดียวกับที่ worker ใช้จริง
# อย่า copy โครงสร้าง lc มาไว้ที่นี่: เคยทำแล้วมันไหลออกจากกัน จน DevPlay
# ตอบ 40000 (request ไม่ถูกต้อง) ทุกครั้ง แล้วถูกรายงานว่า "รหัสผิด"
from heart_farm.heart_farm import _LOGIN_ERROR_MESSAGES, auth_headers, fresh_lc


class DevPlayAuthService:
    AUTH_HOST = "https://account.devplay.com"

    def _fresh_lc(self) -> dict[str, Any]:
        lc = fresh_lc()
        lc["devsisters_id"] = ""  # ตรงกับที่ heart_farm._login ส่งตอนล็อกอินด้วย email
        return lc

    async def verify_credentials(self, email: str, password: str) -> dict[str, Any]:
        email = email.strip()
        if not email or not password:
            return {"valid": False, "error_message": "กรุณากรอกอีเมลและรหัสผ่าน DevPlay"}

        lc = self._fresh_lc()
        # DevPlay ปฏิเสธ (40002) ถ้าไม่มี security headers ชุดเดียวกับที่ worker ส่ง
        headers = auth_headers(lc)
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                await client.post(
                    f"{self.AUTH_HOST}/v4/checkemail",
                    json={"email": email, "lc": lc},
                    headers=headers,
                )
                response = await client.post(
                    f"{self.AUTH_HOST}/v3/login/devsisters",
                    json={
                        "email": email,
                        "password": password,
                        "oven_access_token": "",
                        "lc": lc,
                    },
                    headers=headers,
                )
                data = response.json()
            except httpx.HTTPError as e:
                return {
                    "valid": False,
                    "error_message": f"เชื่อมต่อ DevPlay ไม่ได้: {e}",
                }

        if data.get("game_access_token"):
            member = data.get("member") or {}
            return {
                "valid": True,
                "mid": member.get("mid"),
                "email": email,
            }

        # อย่าเหมาว่าทุก response ที่ไม่มี token แปลว่ารหัสผิด — DevPlay แยก code
        # ไว้ชัด (rate limit / ไม่พบบัญชี / request ไม่ถูกต้อง) ถ้ากลืนเป็นข้อความ
        # เดียว ผู้ใช้จะไล่แก้รหัสที่ถูกอยู่แล้วโดยไม่รู้สาเหตุจริง
        code = data.get("code")
        message = _LOGIN_ERROR_MESSAGES.get(code)
        if not message:
            message = f"DevPlay ปฏิเสธการเข้าสู่ระบบ (code {code}) — ไม่ใช่ปัญหารหัสผ่าน กรุณาแจ้งแอดมิน"
        return {
            "valid": False,
            "error_message": message,
            "error_code": code,
            "raw": data,
        }

    async def verify_batch(self, items: list[dict[str, str]]) -> list[dict[str, Any]]:
        results = []
        for item in items:
            r = await self.verify_credentials(item["email"], item["password"])
            results.append({**r, "email": item["email"]})
        return results


devplay_auth_service = DevPlayAuthService()
