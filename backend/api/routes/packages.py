from fastapi import APIRouter

from core.supabase_client import get_supabase_admin
from models.schemas import PackageOut

router = APIRouter(prefix="/api/packages", tags=["packages"])


@router.get("", response_model=list[PackageOut])
async def list_packages():
    db = get_supabase_admin()
    res = (
        db.table("packages")
        .select("*")
        .eq("is_active", True)
        .order("sort_order")
        .execute()
    )
    return res.data or []
