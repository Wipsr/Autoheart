import re
import unittest

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from config import Settings

PRODUCTION_ORIGIN = "https://autoheart.vercel.app"


def _settings(**kwargs) -> Settings:
    return Settings(_env_file=None, **kwargs)


def _pattern(**kwargs) -> re.Pattern:
    # match() ไม่ใช่ fullmatch() — เทสต้องล้มถ้า pattern ไม่ได้ anchor ไว้เอง
    # แทนที่จะรอดมาเพราะผู้เรียกบังเอิญใช้ fullmatch
    return re.compile(_settings(**kwargs).cors_origin_regex_pattern)


class CorsOriginRegexTests(unittest.TestCase):
    def test_vercel_preview_origins_are_derived_from_production_domain(self):
        pattern = _pattern(cors_origins=PRODUCTION_ORIGIN)

        self.assertTrue(
            pattern.match("https://autoheart-git-main-swkhczs-projects.vercel.app")
        )
        self.assertTrue(
            pattern.match("https://autoheart-cg8o6zfng-swkhczs-projects.vercel.app")
        )

    def test_other_projects_on_vercel_are_not_allowed(self):
        pattern = _pattern(cors_origins=PRODUCTION_ORIGIN)

        self.assertIsNone(pattern.match("https://someone-else.vercel.app"))

    def test_origins_with_a_suffix_glued_on_are_not_allowed(self):
        pattern = _pattern(cors_origins=PRODUCTION_ORIGIN)

        self.assertIsNone(pattern.match("https://autoheart.vercel.app.evil.com"))
        self.assertIsNone(
            pattern.match("https://autoheart-git-main-x.vercel.app.evil.com")
        )

    def test_non_vercel_origins_produce_no_pattern(self):
        self.assertEqual(
            _settings(
                cors_origins="https://autoheart.com,http://localhost:3000"
            ).cors_origin_regex_pattern,
            "",
        )

    def test_explicit_regex_wins(self):
        self.assertEqual(
            _settings(
                cors_origins=PRODUCTION_ORIGIN,
                cors_origin_regex=r"https://staging\.autoheart\.com",
            ).cors_origin_regex_pattern,
            r"https://staging\.autoheart\.com",
        )


class CorsMiddlewareTests(unittest.TestCase):
    """ยิง preflight ผ่าน CORSMiddleware จริง — ผูกกับพฤติกรรมที่ deploy ใช้จริง
    ไม่ใช่แค่ตัว regex ที่เราคิดว่าถูก"""

    def setUp(self):
        settings = _settings(
            cors_origins=f"{PRODUCTION_ORIGIN},http://localhost:3000"
        )
        app = FastAPI()
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list or ["*"],
            allow_origin_regex=settings.cors_origin_regex_pattern or None,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        @app.get("/api/packages")
        async def packages():
            return []

        self.client = TestClient(app)

    def _preflight(self, origin: str):
        return self.client.options(
            "/api/packages",
            headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
        )

    def test_allowed_origins(self):
        for origin in [
            PRODUCTION_ORIGIN,
            "http://localhost:3000",
            "https://autoheart-git-main-swkhczs-projects.vercel.app",
            "https://autoheart-cg8o6zfng-swkhczs-projects.vercel.app",
        ]:
            with self.subTest(origin=origin):
                res = self._preflight(origin)
                self.assertEqual(res.status_code, 200)
                self.assertEqual(res.headers["access-control-allow-origin"], origin)

    def test_rejected_origins(self):
        for origin in [
            "https://someone-else.vercel.app",
            "https://autoheart.vercel.app.evil.com",
            "https://evil.example.com",
        ]:
            with self.subTest(origin=origin):
                res = self._preflight(origin)
                self.assertEqual(res.status_code, 400)
                self.assertNotIn("access-control-allow-origin", res.headers)


if __name__ == "__main__":
    unittest.main()
