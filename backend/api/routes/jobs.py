from __future__ import annotations

from fastapi import APIRouter, Depends

from api.dependencies import check_maintenance, get_current_user
from core.exceptions import InsufficientHeartsError, InsufficientPointsError, NotFoundError, PaymentError
from core.security import encrypt_password
from core.supabase_client import get_supabase_admin
from models.schemas import JobCreateRequest, JobOut
from services.coupon_service import coupon_service
from services.devplay_auth_service import devplay_auth_service
from services.queue_service import queue_service
from services.saved_account_service import saved_account_service
from services.truemoney_service import truemoney_service

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def refund_job_payment(db, job: dict) -> None:
    """คืนสิ่งที่หักไว้ตอนสั่งงาน ตาม payment_method ของงานนั้น
    (point คืนเป็นพอยท์ที่หักจริง, heart/angpao คืนเป็นหัวใจเท่าเป้าหมายงาน —
    อั่งเปาไม่มีกระเป๋าให้คืนของจริง แต่ให้หัวใจเท่ากับที่จ่ายไปแทนเพราะงานไม่สำเร็จ)"""
    method = job.get("payment_method") or "heart"
    if method == "point":
        db.rpc(
            "credit_user_points",
            {"p_user_id": job["user_id"], "p_points": int(job.get("points_spent") or 0), "p_baht": 0},
        ).execute()
    else:
        db.rpc(
            "credit_user_hearts",
            {"p_user_id": job["user_id"], "p_hearts": int(job["target_hearts"]), "p_baht": 0},
        ).execute()


@router.get("/mine", response_model=list[JobOut])
async def my_jobs(user=Depends(get_current_user)):
    db = get_supabase_admin()
    res = (
        db.table("jobs")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return [queue_service.enrich_job_wait(j) for j in (res.data or [])]


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: str, user=Depends(get_current_user)):
    db = get_supabase_admin()
    res = db.table("jobs").select("*").eq("id", job_id).limit(1).execute()
    if not res.data:
        raise NotFoundError("ไม่พบงาน")
    job = res.data[0]
    if job["user_id"] != user["id"] and user.get("role") != "admin":
        raise NotFoundError("ไม่พบงาน")
    return queue_service.enrich_job_wait(job)


@router.get("/{job_id}/logs")
async def get_job_logs(job_id: str, user=Depends(get_current_user)):
    db = get_supabase_admin()
    job = db.table("jobs").select("user_id").eq("id", job_id).limit(1).execute()
    if not job.data:
        raise NotFoundError("ไม่พบงาน")
    if job.data[0]["user_id"] != user["id"] and user.get("role") != "admin":
        raise NotFoundError("ไม่พบงาน")
    logs = (
        db.table("job_logs")
        .select("*")
        .eq("job_id", job_id)
        .order("created_at")
        .limit(500)
        .execute()
    )
    return logs.data or []


@router.post("/create")
async def create_jobs(
    body: JobCreateRequest,
    user=Depends(get_current_user),
    _maintenance=Depends(check_maintenance),
):
    """Create one or many jobs (batch). Verifies credentials, charges by payment_method, enqueues."""
    db = get_supabase_admin()
    payment_method = body.payment_method

    # Resolve target hearts per credential
    packages_cache: dict[int, dict] = {}
    planned: list[dict] = []
    for cred in body.credentials:
        package_id = cred.package_id or body.package_id
        target = cred.target_hearts or body.target_hearts
        if package_id and package_id not in packages_cache:
            pr = db.table("packages").select("*").eq("id", package_id).limit(1).execute()
            if not pr.data:
                raise NotFoundError(f"ไม่พบแพ็คเกจ id={package_id}")
            packages_cache[package_id] = pr.data[0]
        if package_id and not target:
            target = int(packages_cache[package_id]["points"])
        if not target:
            raise InsufficientPointsError("ต้องระบุ package_id หรือ target_hearts")
        if payment_method in ("point", "angpao") and not package_id:
            raise InsufficientPointsError("จ่ายด้วยพอยท์หรืออั่งเปาต้องระบุ package_id เพื่อคิดเรตแลก")
        # รับได้ทั้งบัญชีที่ save ไว้ (account_id) หรือกรอกสด (email+password)
        email, password = await saved_account_service.resolve(
            user["id"], email=cred.email, password=cred.password, account_id=cred.account_id
        )
        planned.append(
            {
                "email": email,
                "password": password,
                "package_id": package_id,
                "target_hearts": int(target),
                "price_baht": float(packages_cache[package_id]["price_baht"]) if package_id else 0.0,
            }
        )

    total_hearts = sum(p["target_hearts"] for p in planned)
    total_price_baht = sum(p["price_baht"] for p in planned)
    coupon_preview = None

    if payment_method == "heart":
        profile = db.table("profiles").select("hearts").eq("id", user["id"]).limit(1).execute().data[0]
        if int(profile["hearts"]) < total_hearts:
            raise InsufficientHeartsError(
                f"หัวใจไม่พอ (มี {profile['hearts']} ต้องการ {total_hearts})"
            )
    elif payment_method == "point":
        points_cost = int(round(total_price_baht))
        profile = db.table("profiles").select("points").eq("id", user["id"]).limit(1).execute().data[0]
        if int(profile["points"]) < points_cost:
            raise InsufficientPointsError(
                f"พอยท์ไม่พอ (มี {profile['points']} ต้องการ {points_cost})"
            )
    elif payment_method == "angpao":
        if not body.voucher:
            raise PaymentError("voucher_required", "ต้องแนบลิงก์ซองอั่งเปา")
        package_ids = {p["package_id"] for p in planned}
        if len(package_ids) != 1:
            raise PaymentError("mixed_packages", "จ่ายอั่งเปาได้ทีละแพ็กเกจเดียวต่อการสั่งงาน")
        common_package_id = package_ids.pop()
        coupon_preview = (
            coupon_service.preview(body.coupon_code, common_package_id, len(planned), user["id"])
            if body.coupon_code
            else None
        )

    expected_baht = coupon_preview["amount_after"] if coupon_preview else total_price_baht

    # Verify all credentials first
    results = []
    for p in planned:
        vr = await devplay_auth_service.verify_credentials(p["email"], p["password"])
        results.append({**p, "verify": vr})

    invalid = [r for r in results if not r["verify"].get("valid")]
    if invalid:
        return {
            "ok": False,
            "error": "validation_failed",
            "invalid": [
                {"email": r["email"], "error_message": r["verify"].get("error_message")}
                for r in invalid
            ],
        }

    topup_id_for_angpao = None
    if payment_method == "angpao":
        result = await truemoney_service.redeem(body.voucher, expected_amount=expected_baht)
        topup_row = {
            "user_id": user["id"],
            "package_id": common_package_id,
            "quantity": len(planned),
            "credit_target": "hearts",
            "voucher_url": body.voucher.strip(),
            "voucher_id": result["voucher_id"],
            "amount_baht": result.get("amount_baht") or expected_baht,
            "status": "credited",
            "credit_status": "credited",
            "hearts_credited": total_hearts,
            "tmn_raw_response": result.get("raw"),
        }
        topup_id_for_angpao = db.table("topup_redemptions").insert(topup_row).execute().data[0]["id"]
        if coupon_preview:
            db.rpc(
                "record_coupon_redemption",
                {
                    "p_coupon_id": coupon_preview["coupon_id"],
                    "p_user_id": user["id"],
                    "p_topup_id": topup_id_for_angpao,
                    "p_amount_before": coupon_preview["amount_before"],
                    "p_discount_baht": coupon_preview["discount_baht"],
                    "p_amount_after": coupon_preview["amount_after"],
                },
            ).execute()
        db.rpc("bump_total_jobs", {"p_user_id": user["id"], "p_count": len(results)}).execute()

    created = []
    for r in results:
        points_spent = 0
        if payment_method == "heart":
            ok = db.rpc(
                "deduct_user_hearts",
                {"p_user_id": user["id"], "p_hearts": r["target_hearts"]},
            ).execute()
            if ok.data is False or ok.data == [False]:
                raise InsufficientHeartsError("หัวใจไม่พอระหว่างสร้างงาน")
        elif payment_method == "point":
            points_spent = int(round(r["price_baht"]))
            ok = db.rpc(
                "pay_job_with_points",
                {"p_user_id": user["id"], "p_points_cost": points_spent},
            ).execute()
            if ok.data is False or ok.data == [False]:
                raise InsufficientPointsError("พอยท์ไม่พอระหว่างสร้างงาน")
        # angpao: จ่ายเรียบร้อยแล้วครั้งเดียวข้างบน ไม่ต้องหักซ้ำต่องาน

        row = {
            "user_id": user["id"],
            "topup_id": topup_id_for_angpao,
            "package_id": r["package_id"],
            "devplay_email": r["email"],
            "devplay_password_encrypted": encrypt_password(r["password"]),
            "target_hearts": r["target_hearts"],
            "points_spent": points_spent,
            "payment_method": payment_method,
            "status": "queued",
            "estimated_duration_minutes": max(1, int(r["target_hearts"] / 50) + 1),
            "progress_message": "อยู่ในคิว",
        }
        job = db.table("jobs").insert(row).execute().data[0]
        created.append(job)

    queue_service.resequence()
    # Refresh with positions + wait
    out = []
    for j in created:
        fresh = db.table("jobs").select("*").eq("id", j["id"]).limit(1).execute().data[0]
        out.append(queue_service.enrich_job_wait(fresh))

    return {"ok": True, "jobs": out, "count": len(out)}


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str, user=Depends(get_current_user)):
    db = get_supabase_admin()
    res = db.table("jobs").select("*").eq("id", job_id).limit(1).execute()
    if not res.data:
        raise NotFoundError("ไม่พบงาน")
    job = res.data[0]
    if job["user_id"] != user["id"] and user.get("role") != "admin":
        raise NotFoundError("ไม่พบงาน")
    if job["status"] not in ("queued", "validating"):
        return {"ok": False, "message": "ยกเลิกได้เฉพาะงานที่ยังอยู่ในคิว"}

    refund_job_payment(db, job)
    db.table("jobs").update(
        {"status": "cancelled", "queue_position": None, "progress_message": "ยกเลิกแล้ว"}
    ).eq("id", job_id).execute()
    queue_service.resequence()
    return {"ok": True}
