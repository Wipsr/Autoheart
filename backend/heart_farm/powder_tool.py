"""
============================================================================
 Cookie Run — POWDER TOOL (ปั๊มผงเวทมนตร์ ผ่านระบบ "ชวนเพื่อน")
============================================================================
 เครื่องมือแยกจาก heart_farm.py สำหรับฟีเจอร์ "ปั๊มผงเวทมนตร์" บนเว็บ Autoheart

 กลไก (คนละทางกับปั๊มหัวใจ แม้จะใช้ guest เหมือนกัน):
   เกมมีระบบชวนเพื่อน — บัญชีที่เพิ่งสร้างใหม่ตั้ง "ผู้ชวน" (referrer) ได้ 1 ครั้ง
   ภายในช่วงเวลาหนึ่งหลังสร้างบัญชี ยิ่งมีคนตั้งเราเป็นผู้ชวนมาก เราก็ยิ่งได้
   แต้มเชิญ + ปลดรางวัลตามขั้น ซึ่งรางวัลหลายขั้นจ่ายเป็น "ผงเวทมนตร์"
   (REWARD_TYPE_POWDER) ตัวเครื่องมือจึงทำแค่ 2 จังหวะ:

     1. สร้าง guest ใหม่แบบขนาน แล้วให้ guest แต่ละตัวเรียก
        InvitationAPI.SetReferrer(referrer_player_id = ไอดีผู้ใช้)
     2. บัญชีผู้ใช้เรียก InvitationAPI.ClaimInvitationReward ซ้ำ ๆ
        จนกว่าจะไม่มีขั้นให้รับแล้ว แล้วรวมยอดรางวัลที่ได้

 ข้อดีเชิงความเสี่ยงเทียบกับปั๊มหัวใจ: SetReferrer เป็นการ "เขียนที่ฝั่ง guest"
 ไม่ใช่ฝั่งบัญชีผู้ใช้ ระหว่างปั๊มจึงไม่มี write ยิงเข้าบัญชีผู้ใช้เลย เหลือแค่
 ตอนกดรับรางวัลตอนท้ายไม่กี่ครั้ง — ต่างจากปั๊มหัวใจที่ต้องรับเพื่อน+รับหัวใจ
 ทีละคน จึงไม่ต้องมี STREAM_CONCURRENCY แบบนั้น และไม่ติดลิมิตเพื่อน 300 คน
 (SetReferrer ไม่ได้ทำให้เป็นเพื่อนกัน จึงไม่ต้องมีขั้นตอนล้างเพื่อนทีหลัง)

 ข้อจำกัดที่ควรรู้: รางวัลตามขั้นเป็น "บันได" ที่มีจำนวนจำกัดและรับได้ครั้งเดียว
 พอเก็บครบขั้นแล้ว ปั๊มเพิ่มจะได้แค่แต้มเชิญ (invitation_point) ที่ต้องเอาไปแลก
 ในร้านแต้มเชิญเอง ซึ่งยังไม่รองรับในเวอร์ชันนี้ — ดู do_pump() ท้ายไฟล์

 รับ input ทาง stdin เป็น JSON บรรทัดเดียว (ไม่ส่งรหัสผ่านทาง argv เพราะ argv
 มองเห็นได้จาก `ps` ของโปรเซสอื่นบนเครื่องเดียวกัน) เหมือน friend_tool.py:

   echo '{"email":"a@b.c","password":"...","count":50}' \
       | python powder_tool.py --mode pump

 คืนผลเป็น JSON บรรทัดเดียวทาง stdout เสมอ ส่วน log ที่มนุษย์อ่านของ
 heart_farm.py จะถูกเบนไป stderr ทั้งหมด
============================================================================
"""
from __future__ import annotations

import argparse
import concurrent.futures
import contextlib
import json
import sys

from heart_farm import (
    WORKERS,
    Guest,
    MainAccount,
    _close_guest_channel,
    create_guest,
)

INVITE_SERVICE = "service.api.InvitationAPI"

# เพดานจำนวน guest ต่อการกด 1 ครั้ง — ไม่ได้มาจากกติกาในเกม แต่กันไม่ให้คำขอเดียว
# กินโควตา proxy/เวลาจนงานอื่นอด ฝั่ง API จำกัดซ้ำอีกชั้นหนึ่งด้วย
MAX_GUESTS = 300
DEFAULT_GUESTS = 50

# ClaimInvitationReward รับได้ทีละขั้น จึงต้องวนเรียก เพดานนี้กันวนไม่รู้จบถ้า
# เซิร์ฟเวอร์ตอบสำเร็จโดยไม่ขยับขั้น (ไม่เคยเจอ แต่ราคาถูกกว่าปล่อยให้ค้าง)
CLAIM_MAX_ROUNDS = 200


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


def _find_powder(data):
    """หายอดผงปัจจุบันจาก payload ของ initMember3 (ที่เก็บ wallet ของบัญชี)

    ไล่หาคีย์ชื่อ powder แบบไม่สนตัวพิมพ์ แทนที่จะ hard-code path เพราะรูปร่าง
    ก้อนนี้เป็นของเซิร์ฟเวอร์เกมและขยับได้ทุกอัปเดต — หาไม่เจอก็คืน None แล้ว
    ให้หน้าเว็บโชว์ขีดแทน ดีกว่าพังทั้งคำขอเพราะเลขโชว์ผลไม่ครบ
    """
    stack = [data]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            for k, v in cur.items():
                if isinstance(k, str) and k.lower() == "powder":
                    # ยอมรับทั้งตัวเลขและสตริงตัวเลข — ก้อน DS ส่งเลขใหญ่มาเป็น
                    # สตริงได้ (เหมือนที่ protobuf ทำกับ int64)
                    try:
                        return int(v)
                    except (TypeError, ValueError):
                        pass
                if isinstance(v, (dict, list)):
                    stack.append(v)
        elif isinstance(cur, list):
            stack.extend(x for x in cur if isinstance(x, (dict, list)))
    return None


def _tree(main):
    """สรุปสถานะระบบชวนเพื่อนของบัญชี — ใช้ทั้งตอนดูสถานะและตอนวัดผลก่อน/หลังปั๊ม"""
    r = main.unary(INVITE_SERVICE, "GetInvitationTree", {"common_req": {}})
    if r.get("__error__"):
        return None
    return {
        "direct_invited_count": int(r.get("direct_invited_count") or 0),
        "total_invited_count": int(r.get("total_invited_count") or 0),
        "invitation_point": int(r.get("invitation_point") or 0),
        "last_rewarded_seq": int(r.get("last_rewarded_seq") or 0),
    }


def _set_referrer_one(main_mid):
    """สร้าง guest 1 ตัวแล้วให้มันตั้งบัญชีผู้ใช้เป็นผู้ชวน

    คืน (ok, reason) — ห้ามโยน exception ออกไป เพราะตัวนี้ถูกรันขนานหลายร้อยตัว
    ถ้าตัวหนึ่งพัง ต้องไม่ลากทั้งชุดไปด้วย (เหตุผลเดียวกับ create_and_friend_one)
    """
    try:
        rec = create_guest()
        if rec.get("__error__"):
            reason = (
                (rec.get("resp") or {}).get("code")
                or rec.get("network_error")
                or rec.get("raw")
                or "?"
            )
            return False, "สร้าง guest ไม่สำเร็จ: %s" % str(reason)[:80]
        g = Guest(rec)
        try:
            g.ensure_game_member()  # ไม่เรียกก่อน gRPC จะโดน UNAUTHENTICATED
            r = g.unary(
                INVITE_SERVICE,
                "SetReferrer",
                {"common_req": {}, "referrer_player_id": main_mid},
            )
            if r.get("__error__"):
                return False, "SetReferrer ถูกปฏิเสธ: %s" % str(r.get("details") or r.get("code"))[:80]
            return True, None
        finally:
            g.close()
    except Exception as e:
        return False, "%s: %s" % (type(e).__name__, str(e)[:80])


def _pump_guests(main_mid, count, workers):
    ok = 0
    failures = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(_set_referrer_one, main_mid) for _ in range(count)]
        for i, fut in enumerate(concurrent.futures.as_completed(futures), 1):
            good, reason = fut.result()
            if good:
                ok += 1
            else:
                # นับเหตุผลเป็นกลุ่ม ไม่เก็บทีละตัว — 300 ตัวที่พังด้วยเหตุเดียวกัน
                # ไม่ควรกลายเป็น error 300 บรรทัดในหน้าเว็บ
                failures[reason] = failures.get(reason, 0) + 1
            if i % 20 == 0:
                print("  [powder] %d/%d guest แล้ว (สำเร็จ %d)" % (i, count, ok))
    return ok, failures


def _claim_rewards(main):
    """กดรับรางวัลขั้นชวนเพื่อนจนหมด แล้วรวมยอดตามประเภทรางวัล

    เซิร์ฟเวอร์จ่ายทีละขั้น และเมื่อไม่มีขั้นให้รับแล้วจะตอบ error กลับมา
    (ไม่ใช่ตอบสำเร็จแบบรางวัลว่าง) จึงถือ error เป็นเงื่อนไขจบตามปกติ ไม่ใช่ความผิดพลาด
    """
    totals = {}
    claimed = 0
    seen = set()
    for _ in range(CLAIM_MAX_ROUNDS):
        r = main.unary(INVITE_SERVICE, "ClaimInvitationReward", {"common_req": {}})
        if r.get("__error__"):
            break
        seq = int(r.get("rewarded_seq") or 0)
        rewards = r.get("rewards") or []
        # ขั้นเดิมซ้ำ = เซิร์ฟเวอร์ไม่ขยับแล้ว หยุดกันวนฟรี
        if seq in seen:
            break
        seen.add(seq)
        claimed += 1
        for rw in rewards:
            t = rw.get("type") or "REWARD_TYPE_UNSPECIFIED"
            totals[t] = totals.get(t, 0) + int(rw.get("qty") or 0)
        if not rewards:
            break
    return totals, claimed


def do_status(main):
    tree = _tree(main)
    if tree is None:
        return {"ok": False, "error": "อ่านข้อมูลระบบชวนเพื่อนไม่สำเร็จ"}
    return {
        "ok": True,
        "mid": main.mid,
        "level": main.lv,
        "powder": _find_powder(getattr(main, "init_data", None) or {}),
        **tree,
    }


def do_pump(main, count):
    count = max(1, min(int(count or DEFAULT_GUESTS), MAX_GUESTS))
    before = _tree(main)

    ok, failures = _pump_guests(main.mid, count, min(WORKERS, count))
    totals, claimed = _claim_rewards(main)
    after = _tree(main)

    powder = totals.get("REWARD_TYPE_POWDER", 0)
    return {
        "ok": True,
        "mid": main.mid,
        "requested": count,
        "invited": ok,
        # เหตุผลที่พัง แปลงเป็น list เรียงตามจำนวน ให้หน้าเว็บโชว์ได้ตรง ๆ
        "failures": [
            {"reason": k, "count": v}
            for k, v in sorted(failures.items(), key=lambda kv: -kv[1])
        ],
        "powder_gained": powder,
        "rewards": [{"type": k, "qty": v} for k, v in sorted(totals.items())],
        "milestones_claimed": claimed,
        "before": before,
        "after": after,
        "powder": _find_powder(getattr(main, "init_data", None) or {}),
        # แต้มเชิญที่เหลือยังแลกผงในร้านแต้มเชิญได้อีก แต่ต้องรู้ offer_seq/ราคา
        # จาก ShopAPI.ListOffers ก่อน — ยังไม่ทำในเวอร์ชันนี้ บอกผู้ใช้ไว้ตรง ๆ
        "note": (
            "รางวัลตามขั้นรับได้ครั้งเดียว ถ้าเก็บครบแล้วการปั๊มเพิ่มจะได้เป็นแต้มเชิญ "
            "ซึ่งต้องนำไปแลกในร้านแต้มเชิญในเกมเอง"
        ),
    }


def _read_input():
    raw = sys.stdin.read()
    try:
        return json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", required=True, choices=["status", "pump"])
    args = ap.parse_args()

    payload = _read_input()
    email = (payload.get("email") or "").strip()
    password = payload.get("password") or ""

    with _stdout_to_stderr() as out:
        if not email or not password:
            _emit(out, {"ok": False, "error": "กรุณาระบุอีเมลและรหัสผ่าน"})
            return 1
        acct = None
        try:
            acct = MainAccount(email, password)
            if args.mode == "status":
                result = do_status(acct)
            else:
                result = do_pump(acct, payload.get("count"))
        except Exception as e:
            # ข้อความ error ของ MainAccount เป็นภาษาไทยอยู่แล้ว ส่งต่อได้เลย
            result = {"ok": False, "error": str(e)[:400]}
        finally:
            if acct is not None:
                acct.close()
            _close_guest_channel()
        _emit(out, result)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
