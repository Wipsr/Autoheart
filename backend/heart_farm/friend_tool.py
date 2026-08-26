"""
============================================================================
 Cookie Run — FRIEND TOOL (list / accept / reject / remove friends)
============================================================================
 เครื่องมือแยกจาก heart_farm.py สำหรับฟีเจอร์ "จัดการเพื่อน" บนเว็บ Autoheart
 ทำแค่ 4 อย่าง ไม่ยุ่งกับการฟาร์มหัวใจเลย:

   list    -> ล็อกอิน DevPlay แล้วคืนรายชื่อเพื่อน + คำขอเป็นเพื่อนที่ค้างอยู่
   delete  -> ลบเพื่อนตาม player_ids ที่ส่งมา (แบ่งเป็นก้อน + มี fallback)
   accept  -> กดรับคำขอเป็นเพื่อนตาม player_ids ที่ส่งมา (ทีละคน + เคารพ cap 300)
   reject  -> ปัดคำขอทิ้งตาม player_ids ที่ส่งมา (ไม่กินช่องเพื่อน จึงไม่มี cap)

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
import time

from heart_farm import ACCEPT_RETRIES, ACCEPT_RETRY_SLEEP, GAME_FRIEND_CAP, MainAccount

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


def _request_out(request):
    """คำขอเป็นเพื่อน = Friend ของคนขอ + เวลาที่ขอ — แปลงหน้าตาให้เหมือน
    _friend_out เป๊ะ ๆ เพื่อให้หน้าเว็บใช้การ์ดรายชื่อตัวเดียวกันได้ทั้งสองเมนู"""
    out = _friend_out(request.get("requester") or {})
    out["request_time"] = request.get("request_time")
    return out


def _fetch(main):
    """ListFriends คืนทั้งรายชื่อเพื่อนและคำขอที่ค้างอยู่มาในก้อนเดียว
    (received_friend_requests) — ไม่มี RPC แยกสำหรับดึงคำขอ"""
    r = main.unary("service.api.FriendAPI", "ListFriends", {"common_req": {}})
    if r.get("__error__"):
        raise RuntimeError("ดึงรายชื่อเพื่อนไม่สำเร็จ: %s" % (r.get("details") or r.get("code")))
    return (r.get("friends") or []), (r.get("received_friend_requests") or [])


def _list_friends(main):
    return _fetch(main)[0]


def _handle_request(main, mid, accept):
    """รับ/ปฏิเสธคำขอ 1 ใบ — RPC เดียวกัน ต่างกันแค่ธง accept

    ไม่ยืม _accept_friend ของ heart_farm.py เพราะตัวนั้นฮาร์ดโค้ด accept=True
    ไว้สำหรับ pipeline ฟาร์มหัวใจ แก้ให้รับพารามิเตอร์ก็ได้ แต่ไม่คุ้มไปแตะ
    hot path ที่ยิงเป็นร้อยครั้งต่อรอบ — ยืมแค่ค่า retry มาใช้ให้เท่ากันพอ"""
    r = None
    for attempt in range(ACCEPT_RETRIES):
        r = main.unary(
            "service.api.FriendAPI",
            "HandleFriendRequest",
            {"common_req": {}, "player_id": mid, "accept": bool(accept)},
        )
        if not r.get("__error__"):
            return True, r
        if attempt < ACCEPT_RETRIES - 1:
            time.sleep(ACCEPT_RETRY_SLEEP)
    return False, r


def _handle_many(main, targets, accept):
    """ไล่ยิงทีละคน (ไม่มี API แบบก้อน) คืนรายการที่พลาดพร้อมสาเหตุ"""
    failed = []
    for pid in targets:
        ok, r = _handle_request(main, pid, accept)
        if not ok:
            err = "%s %s" % (r.get("code"), r.get("details") or "") if r else ""
            failed.append({"player_id": pid, "error": err.strip() or "ไม่ทราบสาเหตุ"})
    return failed


def _pending_targets(player_ids, requests):
    """เอาเฉพาะ id ที่มีคำขอค้างอยู่จริง (กันกดซ้ำหลังคำขอหายไปแล้ว)"""
    pending = {(r.get("requester") or {}).get("player_id") for r in requests}
    targets = [pid for pid in dict.fromkeys(player_ids) if pid in pending]
    return targets, len(set(player_ids)) - len(targets)


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
    friends, requests = _fetch(main)
    return {
        "ok": True,
        "mid": main.mid,
        "level": main.lv,
        "friend_cap": GAME_FRIEND_CAP,
        "friend_count": len(friends),
        "friends": [_friend_out(f) for f in friends],
        "request_count": len(requests),
        "requests": [_request_out(r) for r in requests],
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


def do_accept(main, player_ids):
    """รับเฉพาะ id ที่มีคำขอค้างอยู่จริง แล้วยืนยันผลด้วยการดึงรายชื่อซ้ำ
    ด้วยเหตุผลเดียวกับ do_delete — response ของเซิร์ฟเวอร์บอกแค่ว่า 'รับคำสั่ง
    แล้ว' ไม่ได้แปลว่าเป็นเพื่อนกันจริง"""
    before_friends, before_requests = _fetch(main)
    targets, skipped_not_pending = _pending_targets(player_ids, before_requests)

    # เพดาน 300 คนเป็นของเกม ไม่ใช่ของเรา — เกินแล้วเซิร์ฟเวอร์จะปฏิเสธทีละคน
    # กลายเป็นกอง error ที่ผู้ใช้อ่านไม่รู้เรื่อง ตัดตั้งแต่ต้นทางแล้วบอกตรง ๆ
    # ว่าเหลือช่องเท่าไรดีกว่า
    slots = max(GAME_FRIEND_CAP - len(before_friends), 0)
    skipped_cap = max(len(targets) - slots, 0)
    targets = targets[:slots]

    failed = _handle_many(main, targets, accept=True)

    after_friends, after_requests = _fetch(main)
    now_friends = {f.get("player_id") for f in after_friends}
    accepted = [pid for pid in targets if pid in now_friends]

    return {
        "ok": not failed,
        "requested": len(set(player_ids)),
        "accepted": len(accepted),
        "failed": failed,
        "skipped_not_pending": skipped_not_pending,
        "skipped_cap": skipped_cap,
        "friend_cap": GAME_FRIEND_CAP,
        "friend_count": len(after_friends),
        "request_count": len(after_requests),
        "requests": [_request_out(r) for r in after_requests],
    }


def do_reject(main, player_ids):
    """ปัดคำขอทิ้ง — ไม่มี cap ให้คิดเพราะการปฏิเสธไม่กินช่องเพื่อน

    ยืนยันผลคนละแบบกับ do_accept: อันนั้นเช็คว่า 'เป็นเพื่อนกันแล้วหรือยัง'
    อันนี้เช็คว่า 'คำขอหายไปจากลิสต์แล้วหรือยัง'

    หมายเหตุ: FriendAPI ไม่มี block/ban (มีแค่ 6 method) การปฏิเสธจึงเป็นแค่
    การล้างลิสต์ อีกฝ่ายส่งคำขอกลับมาใหม่ได้ทันที"""
    before_friends, before_requests = _fetch(main)
    targets, skipped_not_pending = _pending_targets(player_ids, before_requests)

    failed = _handle_many(main, targets, accept=False)

    after_friends, after_requests = _fetch(main)
    still_pending = {(r.get("requester") or {}).get("player_id") for r in after_requests}
    rejected = [pid for pid in targets if pid not in still_pending]

    return {
        "ok": not failed,
        "requested": len(set(player_ids)),
        "rejected": len(rejected),
        "failed": failed,
        "skipped_not_pending": skipped_not_pending,
        "friend_cap": GAME_FRIEND_CAP,
        "friend_count": len(after_friends),
        "request_count": len(after_requests),
        "requests": [_request_out(r) for r in after_requests],
    }


def _read_input():
    raw = sys.stdin.read().strip()
    if not raw:
        raise ValueError("ไม่ได้รับ payload ทาง stdin")
    return json.loads(raw)


def main():
    parser = argparse.ArgumentParser(description="Cookie Run friend list / accept / reject / remove tool")
    parser.add_argument("--mode", choices=["list", "accept", "reject", "delete"], required=True)
    args = parser.parse_args()

    with _stdout_to_stderr() as out:
        try:
            payload = _read_input()
            email = (payload.get("email") or "").strip()
            password = payload.get("password") or ""
            if not email or not password:
                raise ValueError("ต้องระบุอีเมลและรหัสผ่าน DevPlay")

            player_ids = [str(p) for p in (payload.get("player_ids") or []) if p]
            if args.mode != "list" and not player_ids:
                raise ValueError("ต้องระบุ player_ids อย่างน้อย 1 รายการ")

            runner = {
                "list": do_list,
                "accept": lambda acc: do_accept(acc, player_ids),
                "reject": lambda acc: do_reject(acc, player_ids),
                "delete": lambda acc: do_delete(acc, player_ids),
            }[args.mode]

            account = MainAccount(email, password)
            try:
                result = runner(account)
            finally:
                account.close()
        except Exception as e:  # ทุก error ออกทาง stdout เป็น JSON เหมือนกันหมด
            _emit(out, {"ok": False, "error": str(e) or e.__class__.__name__})
            return 2

        _emit(out, result)
        return 0


if __name__ == "__main__":
    sys.exit(main())
