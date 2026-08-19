"""TrueMoney angpao voucher redeem service."""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx

from config import get_settings
from core.exceptions import PaymentError
from core.supabase_client import get_supabase_admin


VOUCHER_HASH_RE = re.compile(r"[0-9A-Fa-f]{16,}")


class TrueMoneyService:
    REDEEM_URL = "https://gift.truemoney.com/campaign/vouchers/{hash}/redeem"
    VERIFY_URL = "https://gift.truemoney.com/campaign/vouchers/{hash}/verify"

    def extract_voucher_hash(self, voucher: str) -> str:
        text = voucher.strip()
        # Full URL: .../campaign/?v=HASH or .../vouchers/HASH/...
        if text.startswith("http"):
            parsed = urlparse(text)
            qs = parse_qs(parsed.query)
            if "v" in qs and qs["v"]:
                return qs["v"][0].strip()
            parts = [p for p in parsed.path.split("/") if p]
            for i, p in enumerate(parts):
                if p == "vouchers" and i + 1 < len(parts):
                    return parts[i + 1]
            m = VOUCHER_HASH_RE.search(text)
            if m:
                return m.group(0)
            raise PaymentError("invalid_voucher", "ลิงก์ซองอั่งเปาไม่ถูกต้อง")
        # Raw hash
        if VOUCHER_HASH_RE.fullmatch(text):
            return text
        m = VOUCHER_HASH_RE.search(text)
        if m:
            return m.group(0)
        raise PaymentError("invalid_voucher", "ลิงก์หรือรหัสซองอั่งเปาไม่ถูกต้อง")

    async def get_receiver_phone(self) -> str:
        db = get_supabase_admin()
        res = (
            db.table("system_settings")
            .select("value")
            .eq("key", "truemoney_phone_override")
            .limit(1)
            .execute()
        )
        override = (res.data[0]["value"] if res.data else "") or ""
        override = override.strip()
        if override:
            return override
        phone = get_settings().truewallet_phone.strip()
        if not phone:
            raise PaymentError("config_error", "ยังไม่ได้ตั้งค่าเบอร์ TrueMoney ผู้รับ")
        return phone

    async def redeem(self, voucher: str, expected_amount: float | None = None) -> dict[str, Any]:
        voucher_hash = self.extract_voucher_hash(voucher)
        phone = await self.get_receiver_phone()

        payload = {"mobile": phone, "voucher_hash": voucher_hash}
        url = self.REDEEM_URL.format(hash=voucher_hash)

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0",
                },
            )

        try:
            data = resp.json()
        except Exception:
            raise PaymentError(
                "tmn_error",
                "TrueMoney ตอบกลับไม่ถูกต้อง",
                detail={"status": resp.status_code, "body": resp.text[:500]},
            )

        status_code = str(data.get("status", {}).get("code") or data.get("code") or "")
        # Success codes commonly "SUCCESS" or "0"
        ok = status_code.upper() in ("SUCCESS", "0", "200") or (
            data.get("data") and data.get("status", {}).get("message", "").upper() == "SUCCESS"
        )

        amount = None
        voucher_id = voucher_hash
        try:
            amount = float(
                data.get("data", {})
                .get("voucher", {})
                .get("amount_baht")
                or data.get("data", {}).get("my_ticket", {}).get("amount_baht")
                or data.get("data", {}).get("voucher", {}).get("redeemed_amount_baht")
                or 0
            )
        except (TypeError, ValueError):
            amount = 0.0

        if not ok:
            msg = (
                data.get("status", {}).get("message")
                or data.get("message")
                or "แลกซองอั่งเปาไม่สำเร็จ"
            )
            # Already redeemed / used
            raise PaymentError(
                "redeem_failed",
                str(msg),
                detail={"tmn": data, "voucher_id": voucher_id},
            )

        if expected_amount is not None and amount and abs(amount - float(expected_amount)) > 0.01:
            raise PaymentError(
                "amount_mismatch",
                f"ยอดซอง ({amount} บาท) ไม่ตรงกับยอดที่ต้องชำระ ({expected_amount} บาท)",
                detail={"tmn": data, "voucher_id": voucher_id, "amount": amount},
            )

        return {
            "ok": True,
            "voucher_id": voucher_id,
            "amount_baht": amount,
            "raw": data,
            "phone": phone,
        }


truemoney_service = TrueMoneyService()
