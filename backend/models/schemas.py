from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl


class JobStatus(str, Enum):
    queued = "queued"
    validating = "validating"
    validation_failed = "validation_failed"
    processing = "processing"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"
    refunded = "refunded"


class TopupStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    credited = "credited"
    failed = "failed"
    needs_manual = "needs_manual"
    refunded = "refunded"


class PackageOut(BaseModel):
    id: int
    name: str
    slug: str
    hearts: int
    price_baht: float
    description: Optional[str] = None
    badge: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


class ProfileOut(BaseModel):
    id: UUID
    email: str
    display_name: Optional[str] = None
    role: str
    credits: int
    total_spent_baht: float = 0
    total_jobs: int = 0
    is_banned: bool = False


class TopupRedeemRequest(BaseModel):
    voucher: str = Field(..., min_length=8)
    package_id: int
    quantity: int = Field(1, ge=1, le=50)
    coupon_code: Optional[str] = Field(None, max_length=64)


class TopupOut(BaseModel):
    id: UUID
    package_id: int
    quantity: int
    amount_baht: Optional[float] = None
    status: str
    credit_status: Optional[str] = None
    hearts_credited: int = 0
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None


class CredentialItem(BaseModel):
    # กรอกสด (email+password) หรืออ้างบัญชีที่ save ไว้ (account_id) อย่างใดอย่างหนึ่ง
    email: Optional[str] = None
    password: Optional[str] = None
    account_id: Optional[str] = None
    package_id: Optional[int] = None
    target_hearts: Optional[int] = None


class CredentialsVerifyRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    account_id: Optional[str] = None


class AccountInspectRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    account_id: Optional[str] = None


class PowderScanRequest(BaseModel):
    # กรอกสด (email+password) หรืออ้างบัญชีที่ save ไว้ (account_id) อย่างใดอย่างหนึ่ง
    email: Optional[str] = None
    password: Optional[str] = None
    account_id: Optional[str] = None


class PowderStartRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    account_id: Optional[str] = None
    # เพดานเท่ากับ max_units ของเครื่องมือฝั่ง ngmx — กันพิมพ์เกินตั้งแต่ต้นทาง
    powder: int = Field(..., ge=1, le=1_000_000)


class SavedAccountCreateRequest(BaseModel):
    email: str
    password: str
    label: Optional[str] = None
    # ตรวจรหัสกับ DevPlay ก่อนบันทึกไหม (ดีฟอลต์ตรวจ เพื่อกันบันทึกรหัสผิด)
    verify: bool = True


class FriendListRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    account_id: Optional[str] = None


class FriendAcceptRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    account_id: Optional[str] = None
    # ต้องส่ง id มาเสมอเหมือนตอนลบ — หน้าเว็บดึงคำขอมาก่อนแล้วเลือกว่าจะรับใคร
    player_ids: list[str] = Field(..., min_length=1, max_length=500)


class FriendRejectRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    account_id: Optional[str] = None
    player_ids: list[str] = Field(..., min_length=1, max_length=500)


class FriendDeleteRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    account_id: Optional[str] = None
    # ต้องส่ง id มาเสมอ ไม่มีโหมด "ลบทุกคนโดยไม่ระบุ" ฝั่ง API เพราะการลบเพื่อน
    # กู้คืนไม่ได้ — หน้าเว็บต้องดึงรายชื่อมาก่อนแล้วส่งกลับมาว่าจะลบใครบ้าง
    player_ids: list[str] = Field(..., min_length=1, max_length=500)


class JobCreateRequest(BaseModel):
    """Single or batch job creation. Each credential becomes one job."""
    credentials: list[CredentialItem] = Field(..., min_length=1, max_length=50)
    package_id: Optional[int] = None
    target_hearts: Optional[int] = None


class JobOut(BaseModel):
    id: UUID
    user_id: UUID
    package_id: Optional[int] = None
    devplay_email: str
    target_hearts: int
    queue_position: Optional[int] = None
    status: str
    hearts_collected: int = 0
    current_session: int = 0
    total_sessions: int = 0
    progress_percent: float = 0
    progress_message: Optional[str] = None
    estimated_duration_minutes: Optional[int] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    estimated_wait_minutes: Optional[int] = None


class QueueStatusOut(BaseModel):
    active_job: Optional[JobOut] = None
    queued_count: int
    your_jobs: list[JobOut] = []
    strategy: str = "fair"


class AdminCreditRequest(BaseModel):
    note: Optional[str] = None


class AdminResetPasswordRequest(BaseModel):
    password: str = Field(..., min_length=6, max_length=128)


class ProxyUpdateRequest(BaseModel):
    proxy_url: str = ""
    is_enabled: bool = False


class SystemSettingUpdate(BaseModel):
    value: str


class ProgressEvent(BaseModel):
    job_id: str
    type: str = "progress"
    hearts_collected: int = 0
    target_hearts: int = 0
    progress_percent: float = 0
    message: str = ""
    level: str = "info"
    data: Optional[dict[str, Any]] = None


class PromotionClaimRequest(BaseModel):
    devplay_email: str
    devplay_password: str


class CouponPreviewRequest(BaseModel):
    code: str
    package_id: int
    quantity: int = Field(1, ge=1, le=50)


class CouponInput(BaseModel):
    code: str
    discount_type: str
    discount_value: float
    min_amount_baht: float = 0
    max_discount_baht: Optional[float] = None
    max_uses: Optional[int] = None
    per_user_limit: Optional[int] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: bool = True
    applicable_package_ids: Optional[list[int]] = None


class PackageInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    # slug เป็นคีย์ถาวรที่ migration/สคริปต์ใช้อ้างถึงแพ็ก (เช่น 013 อัปเดตราคาด้วย slug)
    # เลยบังคับรูปแบบ kebab-case ไว้ กันพิมพ์เว้นวรรค/ตัวใหญ่ปนจนอ้างยาก
    slug: str = Field(..., min_length=1, max_length=60, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    hearts: int = Field(..., gt=0)
    price_baht: float = Field(..., ge=0)
    description: Optional[str] = None
    badge: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


class PromotionInput(BaseModel):
    title: str
    hearts_reward: int = Field(gt=0)
    is_active: bool = True
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class PopupInput(BaseModel):
    title: str
    body: str
    is_active: bool = True
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    dismiss_hours: int = Field(24, ge=1, le=8760)
    priority: int = 0
    show_on: str = "all"


class MaintenanceInput(BaseModel):
    enabled: bool
    message: str = ""
    eta: str = ""
    banner_enabled: bool = False
    banner_text: str = ""


class WorkerSettingsInput(BaseModel):
    stuck_timeout_seconds: int = Field(180, ge=30, le=3600)
    watchdog_interval_seconds: int = Field(15, ge=5, le=300)
    retry_base_delay_seconds: int = Field(30, ge=5, le=3600)
    retry_max_attempts: int = Field(3, ge=1, le=10)
    telegram_alert_cooldown_seconds: int = Field(300, ge=0, le=86400)
