from fastapi import APIRouter, Depends, Request

from api.dependencies import check_maintenance, client_meta, get_current_user
from api.middleware.rate_limiter import rate_limiter
from core.exceptions import InsufficientPointsError, NotFoundError, PaymentError
from core.supabase_client import get_supabase_admin
from models.schemas import PointsConvertRequest, TopupOut, TopupRedeemRequest
from services.coupon_service import coupon_service
from services.truemoney_service import truemoney_service

router = APIRouter(prefix="/api/topup", tags=["topup"])


@router.get("/history", response_model=list[TopupOut])
async def topup_history(user=Depends(get_current_user)):
    db = get_supabase_admin()
    res = (
        db.table("topup_redemptions")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return res.data or []


@router.post("/redeem", response_model=TopupOut)
async def redeem_topup(
    body: TopupRedeemRequest,
    request: Request,
    user=Depends(get_current_user),
    _maintenance=Depends(check_maintenance),
):
    rate_limiter.check(f"topup:user:{user['id']}", limit=10, window_seconds=3600)
    rate_limiter.check(
        f"topup:ip:{request.client.host if request.client else 'unknown'}",
        limit=20,
        window_seconds=3600,
    )

    db = get_supabase_admin()
    pkg = None
    coupon_preview = None
    if body.package_id:
        pkg_res = db.table("packages").select("*").eq("id", body.package_id).limit(1).execute()
        if not pkg_res.data:
            raise NotFoundError("ไม่พบแพ็คเกจ")
        pkg = pkg_res.data[0]
        amount_before = float(pkg["price_baht"]) * body.quantity
        coupon_preview = (
            coupon_service.preview(body.coupon_code, body.package_id, body.quantity, user["id"])
            if body.coupon_code
            else None
        )
        expected = coupon_preview["amount_after"] if coupon_preview else amount_before
        hearts_total = int(pkg["points"]) * body.quantity
        credit_target = body.credit_target
    else:
        # เติมพอยท์ทั่วไป ไม่ผูกแพ็กเกจ — ยอดตรงตามซองเป๊ะ ๆ ไม่เช็คยอดที่คาดไว้
        expected = None
        hearts_total = 0
        credit_target = "points"

    meta = client_meta(request)
    row = {
        "user_id": user["id"],
        "package_id": body.package_id,
        "quantity": body.quantity,
        "credit_target": credit_target,
        "voucher_url": body.voucher.strip(),
        "status": "processing",
        "credit_status": "pending",
        "ip_address": meta.get("ip_address"),
        "user_agent": meta.get("user_agent"),
    }
    inserted = db.table("topup_redemptions").insert(row).execute().data[0]
    topup_id = inserted["id"]

    try:
        result = await truemoney_service.redeem(body.voucher, expected_amount=expected)
    except PaymentError as e:
        db.table("topup_redemptions").update(
            {
                "status": "failed",
                "error_code": e.code,
                "error_message": e.message,
                "tmn_raw_response": e.detail,
            }
        ).eq("id", topup_id).execute()
        raise

    voucher_id = result["voucher_id"]
    # Dedup
    existing = (
        db.table("topup_redemptions")
        .select("id")
        .eq("voucher_id", voucher_id)
        .neq("id", topup_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        db.table("topup_redemptions").update(
            {
                "status": "failed",
                "error_code": "duplicate_voucher",
                "error_message": "ซองนี้ถูกใช้ไปแล้ว",
                "voucher_id": voucher_id,
                "tmn_raw_response": result.get("raw"),
                "amount_baht": result.get("amount_baht"),
            }
        ).eq("id", topup_id).execute()
        raise PaymentError("duplicate_voucher", "ซองนี้ถูกใช้ไปแล้ว")

    amount_baht = result.get("amount_baht") or expected or 0
    db.table("topup_redemptions").update(
        {
            "voucher_id": voucher_id,
            "amount_baht": amount_baht,
            "tmn_raw_response": result.get("raw"),
        }
    ).eq("id", topup_id).execute()

    # เติมพอยท์ทั่วไป: เข้าพอยท์ 1 บาท = 1 พอยท์ ตามยอดซองจริง ไม่มีคูปอง
    if not pkg:
        points_total = int(round(amount_baht))
        try:
            db.rpc(
                "credit_user_points",
                {"p_user_id": user["id"], "p_points": points_total, "p_baht": amount_baht},
            ).execute()
            updated = (
                db.table("topup_redemptions")
                .update(
                    {
                        "status": "credited",
                        "credit_status": "credited",
                        "points_credited": points_total,
                    }
                )
                .eq("id", topup_id)
                .execute()
                .data[0]
            )
            return updated
        except Exception as e:
            updated = (
                db.table("topup_redemptions")
                .update(
                    {
                        "status": "needs_manual",
                        "credit_status": "needs_manual",
                        "error_note": str(e),
                        "points_credited": 0,
                    }
                )
                .eq("id", topup_id)
                .execute()
                .data[0]
            )
            return updated

    rpc_name = "credit_user_hearts" if credit_target == "hearts" else "credit_user_points"
    rpc_amount_key = "p_hearts" if credit_target == "hearts" else "p_points"
    try:
        db.rpc(
            rpc_name,
            {"p_user_id": user["id"], rpc_amount_key: hearts_total, "p_baht": amount_baht},
        ).execute()
        if coupon_preview:
            recorded = db.rpc(
                "record_coupon_redemption",
                {
                    "p_coupon_id": coupon_preview["coupon_id"],
                    "p_user_id": user["id"],
                    "p_topup_id": topup_id,
                    "p_amount_before": coupon_preview["amount_before"],
                    "p_discount_baht": coupon_preview["discount_baht"],
                    "p_amount_after": coupon_preview["amount_after"],
                },
            ).execute()
            if recorded.data is not True:
                raise PaymentError("coupon_unavailable", "คูปองถูกใช้ครบแล้ว")
        credited_field = "hearts_credited" if credit_target == "hearts" else "points_credited"
        updated = (
            db.table("topup_redemptions")
            .update(
                {
                    "status": "credited",
                    "credit_status": "credited",
                    credited_field: hearts_total,
                }
            )
            .eq("id", topup_id)
            .execute()
            .data[0]
        )
        return updated
    except Exception as e:
        updated = (
            db.table("topup_redemptions")
            .update(
                {
                    "status": "needs_manual",
                    "credit_status": "needs_manual",
                    "error_note": str(e),
                    "points_credited": 0,
                    "hearts_credited": 0,
                }
            )
            .eq("id", topup_id)
            .execute()
            .data[0]
        )
        return updated


@router.post("/points/convert")
async def convert_points(
    body: PointsConvertRequest,
    user=Depends(get_current_user),
    _maintenance=Depends(check_maintenance),
):
    """แลกพอยท์ในกระเป๋าเป็นหัวใจ ตามเรตของแพ็กเกจที่เลือก (ไม่ต้องรอสั่งงาน)"""
    db = get_supabase_admin()
    pkg_res = db.table("packages").select("*").eq("id", body.package_id).limit(1).execute()
    if not pkg_res.data:
        raise NotFoundError("ไม่พบแพ็คเกจ")
    pkg = pkg_res.data[0]
    points_cost = int(round(float(pkg["price_baht"]) * body.quantity))
    hearts_amount = int(pkg["points"]) * body.quantity

    profile = db.table("profiles").select("points").eq("id", user["id"]).limit(1).execute().data[0]
    if int(profile["points"]) < points_cost:
        raise InsufficientPointsError(
            f"พอยท์ไม่พอ (มี {profile['points']} ต้องการ {points_cost})"
        )

    ok = db.rpc(
        "convert_points_to_hearts",
        {"p_user_id": user["id"], "p_points_cost": points_cost, "p_hearts_amount": hearts_amount},
    ).execute()
    if ok.data is False or ok.data == [False]:
        raise InsufficientPointsError("พอยท์ไม่พอระหว่างแลก")

    return {"ok": True, "points_spent": points_cost, "hearts_credited": hearts_amount}
