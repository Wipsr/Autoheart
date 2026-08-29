"""Pure reliability helpers suitable for isolated testing."""


def classify_failure(message: str) -> str:
    """Credentials and account errors cannot improve through a retry."""
    permanent_markers = (
        "invalid credential",
        "invalid password",
        "login failed",
        "unauthorized",
        "banned",
        "ok=false",
        # The game server rejects the client version we send: every retry
        # sends the same version and earns the same refusal, until an operator
        # bumps CRK_APP_VERSION/CRK_APP_BUILD.
        "low client version",
    )
    return "permanent" if any(marker in message.lower() for marker in permanent_markers) else "transient"


def retry_delay_seconds(attempt_count: int, base_delay_seconds: int) -> int:
    """Return exponential delay after the attempt that just failed."""
    return base_delay_seconds * (2 ** max(0, attempt_count - 1))
