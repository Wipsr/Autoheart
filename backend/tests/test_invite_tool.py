"""เทสต์ตรรกะล้วน ๆ ของ invite_tool.py — ไม่แตะเซิร์ฟเวอร์เกมจริง

ส่วนที่คุ้มเทสต์คือ "การแปลผลลัพธ์" เพราะมันคือจุดที่ผู้ใช้เห็น: guest ที่สร้าง
ไม่ขึ้น (ปัญหา proxy/rate limit) ต้องไม่ถูกนับปนกับ referrer ที่ยิงพลาดจริง
"""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

# heart_farm/ import กันเองแบบ flat (invite_tool ทำ `import heart_farm`) จึงต้อง
# ใส่โฟลเดอร์นั้นเข้า path ตรง ๆ แทนการ import เป็นแพ็กเกจ
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "heart_farm"))

import invite_tool  # noqa: E402


class FakeGuest:
    def __init__(self, response):
        self.mid = "guest-1"
        self._response = response

    def ensure_game_member(self):
        return 1

    def unary(self, service, method, req):
        assert service == invite_tool.INVITATION_API
        assert method == "SetReferrer"
        return self._response

    def close(self):
        pass


def _run_one(guest_response=None, guest_record=None):
    record = guest_record or {"mid": "guest-1"}
    with patch.object(invite_tool, "create_guest", return_value=record), patch.object(
        invite_tool, "Guest", lambda rec: FakeGuest(guest_response)
    ):
        return invite_tool._invite_one("target-mid")


class InviteBucketTests(unittest.TestCase):
    def test_success_when_server_accepts(self):
        bucket, _ = _run_one({"referrer": {"player_id": "target-mid"}})
        self.assertEqual(bucket, "success")

    def test_guest_creation_failure_is_its_own_bucket(self):
        bucket, detail = _run_one(guest_record={"__error__": True, "network_error": "timeout"})
        self.assertEqual(bucket, "create_fail")
        self.assertIn("timeout", detail)

    def test_already_set_is_not_counted_as_failure(self):
        bucket, _ = _run_one(
            {"__error__": True, "code": "StatusCode.ALREADY_EXISTS", "details": "referrer already set"}
        )
        self.assertEqual(bucket, "already")

    def test_other_rpc_errors_are_failures(self):
        bucket, detail = _run_one(
            {"__error__": True, "code": "StatusCode.INTERNAL", "details": "boom"}
        )
        self.assertEqual(bucket, "failed")
        self.assertIn("boom", detail)

    def test_exception_does_not_escape_and_kill_the_batch(self):
        def explode(rec):
            raise RuntimeError("guest blew up")

        with patch.object(invite_tool, "create_guest", return_value={"mid": "g"}), patch.object(
            invite_tool, "Guest", explode
        ):
            bucket, detail = invite_tool._invite_one("target-mid")
        self.assertEqual(bucket, "failed")
        self.assertIn("blew up", detail)


class InviteAggregateTests(unittest.TestCase):
    def test_buckets_are_counted_and_errors_capped(self):
        results = [("success", "")] * 3 + [("failed", "err")] * 12 + [("already", "")]
        with patch.object(invite_tool, "_invite_one", side_effect=results):
            buckets, errors = invite_tool.do_invite("target-mid", len(results), workers=4)
        self.assertEqual(buckets["success"], 3)
        self.assertEqual(buckets["failed"], 12)
        self.assertEqual(buckets["already"], 1)
        self.assertEqual(buckets["create_fail"], 0)
        # เก็บตัวอย่าง error ไว้แค่ 10 อัน ไม่งั้น response บวมตามจำนวนที่พัง
        self.assertEqual(len(errors), 10)


class InviteInputTests(unittest.TestCase):
    def test_count_is_clamped_to_the_game_cap(self):
        self.assertEqual(invite_tool._clamp(100, 29, 1, invite_tool.MAX_INVITES), 29)
        self.assertEqual(invite_tool._clamp(0, 29, 1, invite_tool.MAX_INVITES), 1)
        self.assertEqual(invite_tool._clamp("ไม่ใช่ตัวเลข", 29, 1, invite_tool.MAX_INVITES), 29)

    def test_int64_fields_arrive_as_strings(self):
        # MessageToDict แปลง int64 เป็นสตริง — ถ้าไม่แปลงกลับ หน้าเว็บเอาไปลบกันไม่ได้
        self.assertEqual(invite_tool._int("1234"), 1234)
        self.assertEqual(invite_tool._int(None), 0)

    def test_proxy_is_applied_to_the_heart_farm_module(self):
        import heart_farm

        try:
            invite_tool._apply_proxy("http://user:pass@host:1234")
            self.assertEqual(heart_farm._PROXIES["https"], "http://user:pass@host:1234")
            invite_tool._apply_proxy("")
            self.assertIsNone(heart_farm._PROXIES)
        finally:
            invite_tool._apply_proxy("")


if __name__ == "__main__":
    unittest.main()
