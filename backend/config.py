"""Application configuration from environment."""
import sys
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Supabase
    supabase_url: str = "https://qcfvijgruitljvjrbguh.supabase.co"
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    # TrueMoney
    truewallet_phone: str = ""

    # Crypto for DevPlay passwords at rest
    credentials_encryption_key: str = ""  # 32-byte urlsafe base64 or hex

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # App
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    environment: str = "development"
    hearts_per_minute: float = 50.0
    heart_farm_script: str = "heart_farm/heart_farm.py"
    friend_tool_script: str = "heart_farm/friend_tool.py"

    # ngmx (Pearlz-Core) — แหล่งข้อมูล "เช็คข้อมูลไอดี" ชั่วคราว: เรา proxy ไปที่
    # เว็บนี้เพื่อดึง wallet/inventory พร้อมชื่อ+รูป โดยไม่ต้องแตก content bundle เอง
    # ตั้งใจให้เป็น layer เดียวที่ถอดออกได้เมื่อมีตารางแปล seq ของเราเอง
    ngmx_base_url: str = "https://ngmx.app"

    # ว่างไว้ = ใช้ล่ามตัวเดียวกับที่รัน API (venv ตอน dev / คอนเทนเนอร์ตอน deploy)
    # ตั้งค่านี้เฉพาะเมื่อจงใจให้ worker รันด้วยล่ามคนละตัวจริง ๆ — ถ้าชี้ไปที่ล่าม
    # ที่ไม่ได้ติดตั้ง requirements.txt ไว้ worker จะตายด้วย ModuleNotFoundError
    python_bin: str = ""

    # Operations / reliability (tokens must remain environment-only)
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    worker_stuck_timeout_seconds: int = 180
    worker_watchdog_interval_seconds: int = 15
    worker_retry_base_delay_seconds: int = 30
    worker_retry_max_attempts: int = 3
    telegram_alert_cooldown_seconds: int = 300

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def python_executable(self) -> str:
        """ล่ามที่ใช้ spawn heart_farm.py — ดีฟอลต์คือตัวเดียวกับที่รัน API"""
        return self.python_bin.strip() or sys.executable


@lru_cache
def get_settings() -> Settings:
    return Settings()
