"""Simple in-memory rate limiter (swap for Redis in production)."""
from __future__ import annotations

import time
from collections import defaultdict, deque

from core.exceptions import RateLimitError


class RateLimiter:
    def __init__(self):
        self._hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str, limit: int, window_seconds: int) -> None:
        now = time.time()
        q = self._hits[key]
        while q and q[0] < now - window_seconds:
            q.popleft()
        if len(q) >= limit:
            raise RateLimitError("คำขอมากเกินไป กรุณารอสักครู่")
        q.append(now)


rate_limiter = RateLimiter()
