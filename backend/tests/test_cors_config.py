import re
import unittest

from config import Settings


def _settings(**kwargs) -> Settings:
    return Settings(_env_file=None, **kwargs)


class CorsOriginRegexTests(unittest.TestCase):
    def test_vercel_preview_origins_are_derived_from_production_domain(self):
        pattern = _settings(
            cors_origins="https://autoheart.vercel.app"
        ).cors_origin_regex_pattern
        compiled = re.compile(pattern)

        self.assertTrue(compiled.fullmatch("https://autoheart-git-main-wipsr.vercel.app"))
        self.assertTrue(compiled.fullmatch("https://autoheart-k3d9x1a2b-wipsr.vercel.app"))

    def test_other_projects_on_vercel_are_not_allowed(self):
        pattern = _settings(
            cors_origins="https://autoheart.vercel.app"
        ).cors_origin_regex_pattern
        compiled = re.compile(pattern)

        self.assertIsNone(compiled.fullmatch("https://someone-else.vercel.app"))
        self.assertIsNone(compiled.fullmatch("https://autoheart.vercel.app.evil.com"))

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
                cors_origins="https://autoheart.vercel.app",
                cors_origin_regex=r"https://staging\.autoheart\.com",
            ).cors_origin_regex_pattern,
            r"https://staging\.autoheart\.com",
        )


if __name__ == "__main__":
    unittest.main()
