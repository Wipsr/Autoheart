from fastapi import APIRouter, Depends, Request

from api.dependencies import check_maintenance, client_meta, get_current_user
from api.middleware.rate_limiter import rate_limiter
from models.schemas import CredentialsVerifyRequest
from services.devplay_auth_service import devplay_auth_service

router = APIRouter(prefix="/api/credentials", tags=["credentials"])


@router.post("/verify")
async def verify_credentials(
    body: CredentialsVerifyRequest,
    request: Request,
    user=Depends(get_current_user),
    _maintenance=Depends(check_maintenance),
):
    # ผู้ใช้ตรวจไอดีได้ฟรีก่อนชำระเงิน จึงต้องกันไม่ให้กลายเป็นเครื่องมือลองรหัส DevPlay
    meta = client_meta(request)
    rate_limiter.check(f"verify:user:{user['id']}", limit=20, window_seconds=3600)
    rate_limiter.check(f"verify:ip:{meta.get('ip_address')}", limit=60, window_seconds=3600)

    result = await devplay_auth_service.verify_credentials(body.email, body.password)
    # Never echo password
    return {
        "valid": result.get("valid"),
        "email": body.email,
        "mid": result.get("mid"),
        "error_message": result.get("error_message"),
        # ส่ง code ดิบออกไปด้วยเพื่อให้แยกออกว่า "รหัสผิดจริง" กับ "DevPlay ปฏิเสธ
        # ด้วยเหตุอื่น" ต่างกันยังไง (ไม่ส่ง raw ออกไป)
        "error_code": result.get("error_code"),
    }
