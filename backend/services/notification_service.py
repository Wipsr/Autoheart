"""WebSocket fan-out for job progress and queue updates."""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class NotificationService:
    def __init__(self):
        # job_id -> set of websockets
        self._job_subscribers: dict[str, set[WebSocket]] = defaultdict(set)
        # user_id -> set of websockets (queue updates)
        self._user_subscribers: dict[str, set[WebSocket]] = defaultdict(set)
        self._admin_subscribers: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect_job(self, job_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._job_subscribers[job_id].add(ws)

    async def connect_user(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._user_subscribers[user_id].add(ws)

    async def connect_admin(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._admin_subscribers.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            for s in self._job_subscribers.values():
                s.discard(ws)
            for s in self._user_subscribers.values():
                s.discard(ws)
            self._admin_subscribers.discard(ws)

    async def _send(self, ws: WebSocket, payload: dict[str, Any]) -> None:
        try:
            await ws.send_text(json.dumps(payload, default=str))
        except Exception:
            await self.disconnect(ws)

    async def broadcast_job(self, job_id: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._job_subscribers.get(job_id, set()))
            admins = list(self._admin_subscribers)
        for ws in targets + admins:
            await self._send(ws, payload)

    async def broadcast_user(self, user_id: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._user_subscribers.get(user_id, set()))
        for ws in targets:
            await self._send(ws, payload)

    async def broadcast_admin(self, payload: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._admin_subscribers)
        for ws in targets:
            await self._send(ws, payload)


notification_service = NotificationService()
