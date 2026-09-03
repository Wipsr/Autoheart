"""Autoheart FastAPI entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.routes import account, admin, auth, credentials, friends, jobs, packages, public, queue, saved_accounts, topup, websocket
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

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_request: Request, exc: RequestValidationError):
        """422 ของ FastAPI คืน {"detail": [...]} ที่ไม่มีฟิลด์ message — หน้าเว็บอ่าน
        data.message แล้วตกไป res.statusText ซึ่งบน HTTP/2 เป็นสตริงว่าง กลายเป็น
        error ที่มองไม่เห็นเลยสักตัว (กดปุ่มแล้วเงียบ) บังคับให้ทุก error ของ API
        หน้าตาเหมือนกันหมด { code, message, detail }"""
        first = (exc.errors() or [{}])[0]
        field = ".".join(str(x) for x in first.get("loc", ()) if x != "body") or "payload"
        return JSONResponse(
            status_code=422,
            content={
                "code": "invalid_request",
                "message": "ข้อมูลที่ส่งมาไม่ถูกต้อง (%s: %s)" % (field, first.get("msg", "invalid")),
                "detail": None,
            },
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
    app.include_router(account.router)
    app.include_router(saved_accounts.router)
    app.include_router(friends.router)
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
