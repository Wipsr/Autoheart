from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from core.exceptions import AppError
from core.supabase_client import get_supabase_admin


class CouponService:
    def preview(self, code: str, package_id: int, quantity: int, user_id: str | None = None) -> dict:
        normalized = code.strip().upper()
        db = get_supabase_admin()
        result = db.table("coupons").select("*").eq("code", normalized).limit(1).execute()
        if not result.data:
            raise AppError("coupon_invalid", "ไม่พบคูปองนี้")
        coupon = result.data[0]
        now = datetime.now(timezone.utc)
        if not coupon["is_active"] or (coupon.get("starts_at") and datetime.fromisoformat(coupon["starts_at"].replace("Z", "+00:00")) > now) or (coupon.get("ends_at") and datetime.fromisoformat(coupon["ends_at"].replace("Z", "+00:00")) < now):
            raise AppError("coupon_inactive", "คูปองยังใช้ไม่ได้หรือหมดอายุแล้ว")
        if coupon.get("max_uses") is not None and coupon["used_count"] >= coupon["max_uses"]:
            raise AppError("coupon_exhausted", "คูปองถูกใช้ครบจำนวนแล้ว")
        allowed = coupon.get("applicable_package_ids")
        if allowed and package_id not in allowed:
            raise AppError("coupon_not_applicable", "คูปองนี้ใช้กับแพ็คเกจนี้ไม่ได้")

        package = db.table("packages").select("price_baht").eq("id", package_id).limit(1).execute()
        if not package.data:
            raise AppError("package_not_found", "ไม่พบแพ็คเกจ")
        before = Decimal(str(package.data[0]["price_baht"])) * quantity
        if before < Decimal(str(coupon["min_amount_baht"])):
            raise AppError("coupon_minimum", f"ยอดสั่งซื้อต้องอย่างน้อย {coupon['min_amount_baht']} บาท")
        if user_id and coupon.get("per_user_limit") is not None:
            uses = db.table("coupon_redemptions").select("id", count="exact").eq("coupon_id", coupon["id"]).eq("user_id", user_id).execute()
            if (uses.count or 0) >= coupon["per_user_limit"]:
                raise AppError("coupon_user_limit", "คุณใช้คูปองนี้ครบสิทธิ์แล้ว")

        if coupon["discount_type"] == "percent":
            discount = before * Decimal(str(coupon["discount_value"])) / Decimal("100")
            if coupon.get("max_discount_baht") is not None:
                discount = min(discount, Decimal(str(coupon["max_discount_baht"])))
        else:
            discount = Decimal(str(coupon["discount_value"]))
        discount = min(before, discount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        after = (before - discount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return {
            "coupon_id": coupon["id"],
            "code": coupon["code"],
            "amount_before": float(before),
            "discount_baht": float(discount),
            "amount_after": float(after),
        }


coupon_service = CouponService()
