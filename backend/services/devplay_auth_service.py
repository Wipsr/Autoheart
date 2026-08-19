"""DevPlay credential verification (login probe before queue)."""
from __future__ import annotations

import random
import string
import uuid
from typing import Any

import httpx


class DevPlayAuthService:
    AUTH_HOST = "https://account.devplay.com"
    APP_HEADERS = {
        "X-Bundle-Id": "com.devsisters.crg",
        "X-API-Key": "SrwOwqNLG7fyi0kYvk03xc1s7eM",
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "okhttp/5.3.2",
    }

    def _fresh_lc(self) -> dict[str, Any]:
        return {
            "country": "TH",
            "lang": "th",
            "timezone": "Asia/Bangkok",
            "device": "Android",
            "os_version": "13",
            "sdk_version": "5.3.2",
            "app_version": "1.0.0",
            "device_id": str(uuid.uuid4()),
            "devsisters_id": "",
            "random": "".join(random.choices(string.ascii_lowercase + string.digits, k=16)),
        }

    async def verify_credentials(self, email: str, password: str) -> dict[str, Any]:
        email = email.strip()
        if not email or not password:
            return {"valid": False, "error_message": "กรุณากรอกอีเมลและรหัสผ่าน DevPlay"}

        lc = self._fresh_lc()
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                await client.post(
                    f"{self.AUTH_HOST}/v4/checkemail",
                    json={"email": email, "lc": lc},
                    headers=self.APP_HEADERS,
                )
                response = await client.post(
                    f"{self.AUTH_HOST}/v3/login/devsisters",
                    json={
                        "email": email,
                        "password": password,
                        "oven_access_token": "",
                        "lc": lc,
                    },
                    headers=self.APP_HEADERS,
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

        code = data.get("code")
        return {
            "valid": False,
            "error_message": "อีเมลหรือรหัสผ่าน DevPlay ไม่ถูกต้อง",
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
