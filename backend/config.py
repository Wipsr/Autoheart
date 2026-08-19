"""Application configuration from environment."""
import re
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
    # ว่างไว้ = เดา regex ของ preview deployment จาก cors_origins ที่เป็นโดเมน Vercel
    # ตั้งเองเฉพาะเมื่อใช้ custom domain หรืออยากล็อกให้แคบ/กว้างกว่าค่าที่เดาให้
    cors_origin_regex: str = ""
    environment: str = "development"
    hearts_per_minute: float = 50.0
    heart_farm_script: str = "heart_farm/heart_farm.py"
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
    def cors_origin_regex_pattern(self) -> str:
        """regex ของ origin ที่อนุญาตเพิ่มจาก cors_origins (ว่าง = ไม่มี)

        Vercel ตั้งโดเมนให้ทุก deployment ที่ไม่ใช่ production เป็น
        `{project}-{git branch หรือ hash}-{scope}.vercel.app` ซึ่งเปลี่ยนทุก push
        เอามาใส่ CORS_ORIGINS ตรง ๆ ไม่ได้ ที่นี่เลยเดา pattern จากโดเมน
        production ที่ตั้งไว้แล้ว ให้ preview ยิง backend ตัวเดียวกันได้
        โดยไม่เปิดกว้างถึง *.vercel.app ของโปรเจกต์อื่น
        """
        explicit = self.cors_origin_regex.strip()
        if explicit:
            return explicit

        patterns: list[str] = []
        for origin in self.cors_origin_list:
            match = re.fullmatch(r"https://([A-Za-z0-9-]+)\.vercel\.app", origin)
            if match:
                patterns.append(
                    rf"https://{re.escape(match.group(1))}-[A-Za-z0-9-]+\.vercel\.app"
                )
        return "|".join(dict.fromkeys(patterns))

    @property
    def python_executable(self) -> str:
        """ล่ามที่ใช้ spawn heart_farm.py — ดีฟอลต์คือตัวเดียวกับที่รัน API"""
        return self.python_bin.strip() or sys.executable


@lru_cache
def get_settings() -> Settings:
    return Settings()
