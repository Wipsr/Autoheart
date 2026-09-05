"""ทดสอบชั้น proxy ปั๊มผง: ยิงถูก endpoint, map error ของ ngmx, และ patch สถานะ

ไม่แตะเน็ตจริง — สวม MockTransport ให้ httpx แทน ngmx
"""
import asyncio
import unittest

import httpx

from api.routes.powder import _patch_from_ngmx
from services.ngmx_service import NgmxError, NgmxService


def _service(handler) -> NgmxService:
    """NgmxService ที่ถูกยัด client ปลอมไว้แล้ว (ข้ามการขอ session จริง)"""
    svc = NgmxService()
    client = httpx.AsyncClient(
        base_url="https://ngmx.test", transport=httpx.MockTransport(handler)
    )
    client.cookies.set("crw_key", "test", domain="ngmx.test")
    svc._job_client = client
    return svc


class PowderProxyTests(unittest.TestCase):
    def test_start_sends_tool_id_and_returns_job(self):
        seen = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["url"] = str(request.url)
            seen["body"] = request.read().decode()
            return httpx.Response(200, json={"job": {"id": "j1", "status": "queued"}})

        job = asyncio.run(_service(handler).powder_start("a@b.c", "pw", 500))
        self.assertEqual(job["id"], "j1")
        self.assertTrue(seen["url"].endswith("/api/jobs"))
        self.assertIn('"powder_farm"', seen["body"])
        self.assertIn('"powder":500', seen["body"])

    def test_error_message_from_ngmx_is_surfaced(self):
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(400, json={"error": "no_points", "message": "พ้อยท์ไม่พอ"})

        with self.assertRaises(NgmxError) as ctx:
            asyncio.run(_service(handler).powder_scan("a@b.c", "pw"))
        self.assertEqual(ctx.exception.message, "พ้อยท์ไม่พอ")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_jobs_are_keyed_by_ngmx_id(self):
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"jobs": [{"id": "j1"}, {"id": "j2"}]})

        jobs = asyncio.run(_service(handler).powder_jobs())
        self.assertEqual(sorted(jobs), ["j1", "j2"])

    def test_missing_credentials_never_reach_ngmx(self):
        def handler(_request: httpx.Request) -> httpx.Response:  # pragma: no cover
            raise AssertionError("ต้องไม่ยิงออกไปเมื่อกรอกไม่ครบ")

        with self.assertRaises(NgmxError):
            asyncio.run(_service(handler).powder_scan("", ""))


class PatchTests(unittest.TestCase):
    ROW = {
        "status": "queued",
        "progress": 0,
        "status_line": None,
        "delivered": 0,
        "error_message": None,
    }

    def test_only_changed_fields_are_written(self):
        patch = _patch_from_ngmx(dict(self.ROW), {"status": "running", "progress": 12})
        self.assertEqual(patch, {"status": "running", "progress": 12})

    def test_no_change_means_no_update(self):
        self.assertEqual(_patch_from_ngmx(dict(self.ROW), {"status": "queued"}), {})

    def test_empty_status_line_keeps_the_last_known_one(self):
        row = dict(self.ROW, status="running", status_line="ซื้อกล่องที่ 3")
        self.assertNotIn("status_line", _patch_from_ngmx(row, {"status": "running"}))

    def test_error_message_is_lifted_out_of_the_error_object(self):
        patch = _patch_from_ngmx(
            dict(self.ROW), {"status": "error", "error": {"message": "เหรียญไม่พอ"}}
        )
        self.assertEqual(patch["error_message"], "เหรียญไม่พอ")


if __name__ == "__main__":
    unittest.main()
