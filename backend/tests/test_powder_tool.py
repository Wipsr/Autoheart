import sys
import unittest
from pathlib import Path

# powder_tool.py ทำ `from heart_farm import ...` ซึ่งหมายถึงไฟล์ heart_farm.py
# ที่อยู่ข้าง ๆ กัน ไม่ใช่โฟลเดอร์ heart_farm/ — ต้องใส่โฟลเดอร์นั้นเข้า sys.path
# ก่อน เหมือนที่ powder_service.py รัน subprocess ด้วย cwd=heart_farm/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "heart_farm"))

from powder_tool import _claim_rewards, _find_powder  # noqa: E402


class FakeMain:
    """แทน MainAccount โดยป้อนคำตอบของ ClaimInvitationReward ไว้ล่วงหน้า"""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    def unary(self, service, method, req=None):
        self.calls += 1
        if not self.responses:
            return {"__error__": True, "code": "FAILED_PRECONDITION"}
        return self.responses.pop(0)


class FindPowderTests(unittest.TestCase):
    def test_finds_powder_nested_anywhere(self):
        data = {"a": 1, "wallet": {"gem": 5, "powder": 1234}}
        self.assertEqual(_find_powder(data), 1234)

    def test_accepts_numeric_string(self):
        # ก้อน DS ส่งเลขใหญ่มาเป็นสตริงได้ เหมือนที่ protobuf ทำกับ int64
        self.assertEqual(_find_powder({"cash": {"powder": "98765"}}), 98765)

    def test_searches_through_lists(self):
        self.assertEqual(_find_powder({"xs": [{"y": {"Powder": 7}}]}), 7)

    def test_missing_powder_returns_none(self):
        self.assertIsNone(_find_powder({"gem": 1, "coin": 2}))

    def test_non_numeric_powder_is_ignored(self):
        self.assertIsNone(_find_powder({"powder": "not-a-number"}))


class ClaimRewardsTests(unittest.TestCase):
    def test_sums_rewards_across_milestones(self):
        main = FakeMain([
            {"rewarded_seq": 1, "rewards": [{"type": "REWARD_TYPE_POWDER", "qty": "100"}]},
            {"rewarded_seq": 2, "rewards": [
                {"type": "REWARD_TYPE_POWDER", "qty": "50"},
                {"type": "REWARD_TYPE_COIN", "qty": "999"},
            ]},
        ])
        totals, claimed = _claim_rewards(main)
        self.assertEqual(claimed, 2)
        self.assertEqual(totals["REWARD_TYPE_POWDER"], 150)
        self.assertEqual(totals["REWARD_TYPE_COIN"], 999)

    def test_stops_on_error_which_means_no_milestone_left(self):
        # ไม่มีขั้นให้รับแล้ว เซิร์ฟเวอร์ตอบ error — ถือเป็นการจบปกติ ไม่ใช่ข้อผิดพลาด
        main = FakeMain([])
        totals, claimed = _claim_rewards(main)
        self.assertEqual((totals, claimed), ({}, 0))

    def test_stops_when_server_repeats_the_same_milestone(self):
        # กันวนไม่รู้จบถ้าเซิร์ฟเวอร์ตอบสำเร็จโดยไม่ขยับขั้น
        same = {"rewarded_seq": 4, "rewards": [{"type": "REWARD_TYPE_POWDER", "qty": "10"}]}
        main = FakeMain([same, dict(same), dict(same)])
        totals, claimed = _claim_rewards(main)
        self.assertEqual(claimed, 1)
        self.assertEqual(totals["REWARD_TYPE_POWDER"], 10)

    def test_stops_on_empty_reward_list(self):
        main = FakeMain([{"rewarded_seq": 9, "rewards": []}])
        totals, claimed = _claim_rewards(main)
        self.assertEqual(totals, {})
        self.assertEqual(claimed, 1)


if __name__ == "__main__":
    unittest.main()
