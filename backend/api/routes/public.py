from fastapi import APIRouter, Depends, Request

from api.dependencies import client_meta, get_current_user
from api.middleware.rate_limiter import rate_limiter
from models.schemas import CouponPreviewRequest, PromotionClaimRequest
from services.coupon_service import coupon_service
from services.popup_service import popup_service
from services.promotion_service import promotion_service
from services.queue_service import queue_service

router = APIRouter(tags=["public"])


@router.get("/api/public/site-config")
async def site_config():
    return popup_service.site_config()


@router.get("/api/public/queue-stats")
async def public_queue_stats():
    """สถานะคิวรวมสำหรับโชว์บนหน้าแรก — ไม่ต้องล็อกอิน ไม่มีข้อมูลผู้ใช้"""
    return queue_service.public_stats()


@router.get("/api/promotions/active")
async def active_promotions():
    return promotion_service.active()


@router.post("/api/promotions/{promotion_id}/claim")
async def claim_promotion(promotion_id: str, body: PromotionClaimRequest, request: Request, user=Depends(get_current_user)):
    meta = client_meta(request)
    rate_limiter.check(f"trial:user:{user['id']}", 5, 3600)
    rate_limiter.check(f"trial:ip:{meta.get('ip_address')}", 20, 3600)
    return await promotion_service.claim(
        promotion_id, user["id"], body.devplay_email, body.devplay_password, meta.get("ip_address")
    )


@router.post("/api/coupons/preview")
async def preview_coupon(body: CouponPreviewRequest, user=Depends(get_current_user)):
    return coupon_service.preview(body.code, body.package_id, body.quantity, user["id"])
