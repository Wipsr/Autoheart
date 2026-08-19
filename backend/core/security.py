"""JWT helpers and AES credential encryption."""
from __future__ import annotations

import base64
import hashlib
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from jose import JWTError, jwt

from config import get_settings
from core.exceptions import AuthError


def decode_supabase_jwt(token: str) -> dict[str, Any]:
    settings = get_settings()
    if not token:
        raise AuthError("Missing bearer token")

    try:
        if settings.supabase_jwt_secret:
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        # Fallback: decode without verify only in development (not recommended)
        if settings.environment == "development" and not settings.supabase_jwt_secret:
            return jwt.get_unverified_claims(token)
        raise AuthError("JWT secret not configured")
    except JWTError as e:
        raise AuthError(f"Invalid token: {e}") from e


def _aes_key() -> bytes:
    settings = get_settings()
    raw = settings.credentials_encryption_key or settings.supabase_service_role_key or "dev-insecure-key"
    # Derive 32-byte key
    if len(raw) == 64:
        try:
            return bytes.fromhex(raw)
        except ValueError:
            pass
    try:
        decoded = base64.urlsafe_b64decode(raw + "==")
        if len(decoded) == 32:
            return decoded
    except Exception:
        pass
    return hashlib.sha256(raw.encode("utf-8")).digest()


def encrypt_password(plaintext: str) -> str:
    key = _aes_key()
    aes = AESGCM(key)
    nonce = os.urandom(12)
    ct = aes.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.urlsafe_b64encode(nonce + ct).decode("ascii")


def decrypt_password(ciphertext: str) -> str:
    key = _aes_key()
    raw = base64.urlsafe_b64decode(ciphertext.encode("ascii"))
    nonce, ct = raw[:12], raw[12:]
    aes = AESGCM(key)
    return aes.decrypt(nonce, ct, None).decode("utf-8")
