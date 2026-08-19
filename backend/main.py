"""Autoheart FastAPI entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.routes import admin, auth, credentials, jobs, packages, public, queue, topup, websocket
from config import get_settings
from core.exceptions import AppError
from services.job_runner_service import job_runner_service
from services.worker_watchdog_service import worker_watchdog_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    job_runner_service.start_background()
    worker_watchdog_service.start_background()
    yield
    await worker_watchdog_service.stop_background()
    await job_runner_service.stop_background()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Autoheart API",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(AppError)
    async def app_error_handler(_request: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.code, "message": exc.message, "detail": exc.detail},
        )

    @app.get("/health")
    async def health():
        return {
            "ok": True,
            "service": "autoheart",
            "worker": worker_watchdog_service.status(),
        }

    app.include_router(auth.router)
    app.include_router(public.router)
    app.include_router(packages.router)
    app.include_router(topup.router)
    app.include_router(credentials.router)
    app.include_router(jobs.router)
    app.include_router(queue.router)
    app.include_router(admin.router)
    app.include_router(websocket.router)
    app.include_router(websocket.me_router)
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    s = get_settings()
    uvicorn.run("main:app", host=s.api_host, port=s.api_port, reload=True)
