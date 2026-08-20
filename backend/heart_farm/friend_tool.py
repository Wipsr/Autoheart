"""
============================================================================
 Cookie Run — FRIEND TOOL (list / remove friends)
============================================================================
 เครื่องมือแยกจาก heart_farm.py สำหรับฟีเจอร์ "ลบเพื่อน" บนเว็บ Autoheart
 ทำแค่ 2 อย่าง ไม่ยุ่งกับการฟาร์มหัวใจเลย:

   list    -> ล็อกอิน DevPlay แล้วคืนรายชื่อเพื่อนทั้งหมดเป็น JSON
   delete  -> ลบเพื่อนตาม player_ids ที่ส่งมา (แบ่งเป็นก้อน + มี fallback)

 รับ input ทาง stdin เป็น JSON บรรทัดเดียว (ไม่ส่งรหัสผ่านทาง argv เพราะ
 argv มองเห็นได้จาก `ps` ของโปรเซสอื่นบนเครื่องเดียวกัน):

   echo '{"email":"a@b.c","password":"...","player_ids":[]}' \
       | python friend_tool.py --mode list

 คืนผลเป็น JSON บรรทัดเดียวทาง stdout เสมอ (ทั้งกรณีสำเร็จและล้มเหลว)
 ส่วน log ที่มนุษย์อ่านของ heart_farm.py จะถูกเบนไป stderr ทั้งหมด เพื่อให้
 stdout มีแต่ JSON ก้อนเดียวให้ backend parse ได้ตรง ๆ
============================================================================
"""
from __future__ import annotations

import argparse
import contextlib
import json
import sys

from heart_farm import GAME_FRIEND_CAP, MainAccount

# RemoveFriend ก้อนใหญ่เกินไปเซิร์ฟเวอร์ตอบ INTERNAL (เจอมาแล้วกับ AcceptLife
# ที่ยิงทีเดียว 219 seq) เลยแบ่งเป็นก้อนตั้งแต่แรกแทนที่จะรอให้พังก่อน
REMOVE_CHUNK = 50


@contextlib.contextmanager
def _stdout_to_stderr():
    """กัน print() ของ heart_farm.py ไม่ให้ปนกับ JSON ผลลัพธ์บน stdout"""
    real = sys.stdout
    sys.stdout = sys.stderr
    try:
        yield real
    finally:
        sys.stdout = real


def _emit(stream, payload):
    stream.write(json.dumps(payload, ensure_ascii=False) + "\n")
    stream.flush()


def _looks_like_guest(friend):
    """เกณฑ์เดียวกับ cleanup_guests ใน heart_farm.py — บัญชี guest ที่บอทสร้าง
    จะ level 1 และไม่เคยตั้งชื่อเล่น ใช้เป็นแค่ 'ป้ายบอกใบ้' ให้ผู้ใช้ดูเท่านั้น
    ฝั่งเว็บไม่ได้เอาไปตัดสินใจลบเอง (ผู้ใช้เป็นคนเลือก)"""
    return friend.get("level") == 1 and not (friend.get("profile") or {}).get("nickname")


def _friend_out(friend):
    profile = friend.get("profile") or {}
    return {
        "player_id": friend.get("player_id"),
        "nickname": profile.get("nickname") or "",
        "level": friend.get("level") or 0,
        "last_seen_at": friend.get("last_seen_dt"),
        "favorite": bool(friend.get("favorite")),
        "gift_count": friend.get("gift_count") or 0,
        "trophy_count": friend.get("trophy_count") or 0,
        "looks_like_guest": _looks_like_guest(friend),
    }


def _list_friends(main):
    r = main.unary("service.api.FriendAPI", "ListFriends", {"common_req": {}})
    if r.get("__error__"):
        raise RuntimeError("ดึงรายชื่อเพื่อนไม่สำเร็จ: %s" % (r.get("details") or r.get("code")))
    return r.get("friends") or []


def _remove_chunk(main, player_ids):
    r = main.unary(
        "service.api.FriendAPI",
        "RemoveFriend",
        {"common_req": {}, "player_ids": list(player_ids)},
    )
    if r.get("__error__"):
        return False, "%s %s" % (r.get("code"), r.get("details") or "")
    return True, ""


def do_list(main):
    friends = _list_friends(main)
    return {
        "ok": True,
        "mid": main.mid,
        "level": main.lv,
        "friend_cap": GAME_FRIEND_CAP,
        "friend_count": len(friends),
        "friends": [_friend_out(f) for f in friends],
    }


def do_delete(main, player_ids):
    """ลบเฉพาะ id ที่ยังเป็นเพื่อนอยู่จริง แล้วยืนยันผลด้วยการดึงรายชื่อซ้ำ
    ไม่เชื่อ response ของ RemoveFriend อย่างเดียว เพราะ 'ok' ของเซิร์ฟเวอร์
    ไม่ได้แปลว่าลบครบทุก id ที่ส่งไป"""
    before = _list_friends(main)
    existing = {f.get("player_id") for f in before}
    targets = [pid for pid in dict.fromkeys(player_ids) if pid in existing]
    skipped = len(set(player_ids)) - len(targets)

    if not targets:
        return {
            "ok": True,
            "requested": len(set(player_ids)),
            "removed": 0,
            "failed": [],
            "skipped_not_friend": skipped,
            "friend_count": len(before),
            "friends": [_friend_out(f) for f in before],
            "message": "ไม่มีรายชื่อที่ต้องลบ",
        }

    failed = []
    for i in range(0, len(targets), REMOVE_CHUNK):
        chunk = targets[i:i + REMOVE_CHUNK]
        ok, err = _remove_chunk(main, chunk)
        if ok:
            continue
        # ก้อนพังไม่ได้แปลว่าทุก id ในก้อนพัง — ไล่ทีละคนเพื่อไม่ให้เสียทั้งก้อน
        print("  chunk of %d failed (%s) -> retrying one-at-a-time" % (len(chunk), err))
        for pid in chunk:
            ok_one, err_one = _remove_chunk(main, [pid])
            if not ok_one:
                failed.append({"player_id": pid, "error": err_one})

    after = _list_friends(main)
    still = {f.get("player_id") for f in after}
    removed = [pid for pid in targets if pid not in still]

    return {
        "ok": not failed,
        "requested": len(set(player_ids)),
        "removed": len(removed),
        "failed": failed,
        "skipped_not_friend": skipped,
        "friend_count": len(after),
        "friends": [_friend_out(f) for f in after],
    }


def _read_input():
    raw = sys.stdin.read().strip()
    if not raw:
        raise ValueError("ไม่ได้รับ payload ทาง stdin")
    return json.loads(raw)


def main():
    parser = argparse.ArgumentParser(description="Cookie Run friend list / remove tool")
    parser.add_argument("--mode", choices=["list", "delete"], required=True)
    args = parser.parse_args()

    with _stdout_to_stderr() as out:
        try:
            payload = _read_input()
            email = (payload.get("email") or "").strip()
            password = payload.get("password") or ""
            if not email or not password:
                raise ValueError("ต้องระบุอีเมลและรหัสผ่าน DevPlay")

            player_ids = [str(p) for p in (payload.get("player_ids") or []) if p]
            if args.mode == "delete" and not player_ids:
                raise ValueError("ต้องระบุ player_ids อย่างน้อย 1 รายการ")

            account = MainAccount(email, password)
            try:
                result = do_list(account) if args.mode == "list" else do_delete(account, player_ids)
            finally:
                account.close()
        except Exception as e:  # ทุก error ออกทาง stdout เป็น JSON เหมือนกันหมด
            _emit(out, {"ok": False, "error": str(e) or e.__class__.__name__})
            return 2

        _emit(out, result)
        return 0


if __name__ == "__main__":
    sys.exit(main())
