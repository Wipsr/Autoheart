"""
============================================================================
 Cookie Run — INVITE TOOL (status / invite)
============================================================================
 เครื่องมือแยกจาก heart_farm.py สำหรับฟีเจอร์ "เชิญเพื่อน" บนเว็บ Autoheart
 ทำแค่ 2 อย่าง ไม่ยุ่งกับการฟาร์มหัวใจเลย:

   status -> ล็อกอิน DevPlay แล้วคืนสถานะสายเชิญเพื่อน (GetInvitationTree)
   invite -> สร้าง guest ใหม่ N ตัว ให้แต่ละตัวตั้ง referrer เป็นไอดีเป้าหมาย

 กลไกของเกม (service/api/invitation_api.proto ใน _descriptors.bin):
   SetReferrer{referrer_player_id} คือการบอกเกมว่า "ใครชวนบัญชีนี้มา" ตั้งได้
   ครั้งเดียวต่อบัญชี และเซิร์ฟเวอร์เปิดให้เฉพาะบัญชีที่ยังใหม่ (GetInvitationTree
   คืน can_set_referrer / can_set_referrer_until มาบอก) ยอดที่เพิ่มให้ผู้ถูกเชิญ
   คือ direct_invited_count ซึ่งเป็นตัวนับที่ ClaimInvitationReward ใช้จ่ายรางวัล

 ทำไมสร้าง guest สดตอนรัน ไม่ทำพูลไว้ล่วงหน้า:
   สิทธิ์ตั้ง referrer หมดอายุตามอายุบัญชี พูลที่ค้างไว้จึงเน่าเองเงียบ ๆ และ
   ต้องมีตารางสถานะ + งานเติมพูลมาดูแลอีกชั้น ในเมื่อ create_guest() ของเรา
   สร้างทีละหลายร้อยตัวอยู่แล้ว การสร้างสด 29 ตัวตอนกดจึงทั้งง่ายกว่าและ
   การันตีว่าทุกตัวยังตั้ง referrer ได้จริง

 รับ input ทาง stdin เป็น JSON บรรทัดเดียว (เหตุผลเดียวกับ friend_tool.py —
 ทั้งรหัสผ่านและ proxy URL ที่มี user:pass ห้ามโผล่ใน `ps` ของโปรเซสอื่น):

   echo '{"email":"a@b.c","password":"...","count":29}' \
       | python invite_tool.py --mode invite

 คืนผลเป็น JSON บรรทัดเดียวทาง stdout เสมอ (ทั้งสำเร็จและล้มเหลว) log ที่
 มนุษย์อ่านของ heart_farm.py ถูกเบนไป stderr ทั้งหมด
============================================================================
"""
from __future__ import annotations

import argparse
import contextlib
import json
import random
import string
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import heart_farm
from heart_farm import Guest, MainAccount, _close_guest_channel, create_guest

INVITATION_API = "service.api.InvitationAPI"
MEMBER_API = "service.api.MemberAPI"

# บัญชีที่ยังไม่มีโปรไฟล์ตั้ง referrer ไม่ได้ — เซิร์ฟเวอร์ตอบ "ILLEGAL PARAMETER"
# (ทดสอบกับเซิร์ฟจริงแล้ว: ยิง SetMemberProfile ก่อนแล้ว SetReferrer ผ่านทันที)
# ค่าที่สุ่มมาจาก enum ของเกมตรง ๆ — เกมนี้เป็นเวอร์ชันอินเดีย region จึงเป็นรัฐ
_REGIONS = (
    "PROFILE_REGION_MAHARASHTRA",
    "PROFILE_REGION_KARNATAKA",
    "PROFILE_REGION_TAMIL_NADU",
    "PROFILE_REGION_GUJARAT",
    "PROFILE_REGION_WEST_BENGAL",
    "PROFILE_REGION_UTTAR_PRADESH",
    "PROFILE_REGION_NATIONAL_CAPITAL_TERRITORY_OF_DELHI",
)
_LANGUAGES = ("PROFILE_LANGUAGE_ENGLISH", "PROFILE_LANGUAGE_HINDI")
_GENDERS = ("GENDER_MALE", "GENDER_FEMALE", "GENDER_OTHER")
_AGE_GROUPS = (
    "AGE_GROUP_OLD_TEEN_YOUNG_TWENTY",
    "AGE_GROUP_OLD_TWENTY_YOUNG_THIRTY",
    "AGE_GROUP_OLD_THIRTY_YOUNG_FORTY",
)
PROFILE_RETRIES = 2

# เพดานต่อการกด 1 ครั้ง — ตัวเลข 29 มาจากขั้นรางวัลของ track เชิญเพื่อนในเกม
# (เว็บคู่แข่งขายเป็นล็อกละ 29 เหมือนกัน) ผู้ใช้ลดลงมาได้แต่ห้ามเกิน เพราะทุก 1
# คน = สร้าง guest 1 ตัว ซึ่งกิน rate limit ของ DevPlay ร่วมกับงานฟาร์มหัวใจ
MAX_INVITES = 29
DEFAULT_INVITES = 29

# ขนานพอให้ 29 ตัวจบในไม่กี่สิบวินาที แต่ไม่แรงเท่า WORKERS=100 ของงานฟาร์ม
# เพราะงานนี้ยิงแบบ synchronous ค้าง HTTP request ของผู้ใช้ไว้
DEFAULT_WORKERS = 10
MAX_WORKERS = 20

# เซิร์ฟเวอร์ไม่มี error code เฉพาะสำหรับ "ตั้ง referrer ไปแล้ว" — ดูจากข้อความ
# แทน เพื่อแยกออกจากความผิดพลาดจริงที่กดซ้ำแล้วอาจสำเร็จ
_ALREADY_HINTS = ("already", "exist", "duplicate")


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


def _apply_proxy(proxy):
    """create_guest() อ่าน _PROXIES ระดับโมดูล ต้องเซ็ตก่อนสร้าง guest ตัวแรก
    (ท่าเดียวกับ api_main ของ heart_farm.py) ไม่มี proxy ก็รันได้ แต่สร้าง guest
    หลายสิบตัวจาก IP เดียวมีสิทธิ์โดน rate limit ของ login server"""
    proxy = (proxy or "").strip()
    heart_farm.PROXY_URL = proxy
    heart_farm._PROXIES = {"http": proxy, "https": proxy} if proxy else None


def _err_text(r):
    return ("%s %s" % (r.get("code"), r.get("details") or "")).strip()


def _int(v):
    """ฟิลด์ int64 ของ proto ถูก MessageToDict แปลงเป็น "สตริง" ไม่ใช่ตัวเลข
    (direct_invited_count / total_invited_count / invitation_point เป็น int64)
    ปล่อยผ่านไปหน้าเว็บตรง ๆ จะเอาไปบวกลบไม่ได้"""
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _node_out(node):
    if not node:
        return None
    return {
        "player_id": node.get("player_id") or "",
        "nickname": node.get("nickname") or "",
    }


def _get_tree(account):
    """คืน (tree, error) — ไม่ raise

    GetInvitationTree ตอบ INTERNAL SERVER ERROR กับบัญชีที่ยังไม่มีข้อมูลสาย
    เชิญเพื่อน (เจอกับ guest ที่เพิ่งสร้างทุกตัว) ซึ่งไม่ใช่เหตุผลที่จะล้มทั้งงาน
    — ตัวเลขยืนยันผลเป็นของแถม ส่วนงานหลักคือการตั้ง referrer ต้องเดินต่อได้"""
    r = account.unary(INVITATION_API, "GetInvitationTree", {"common_req": {}})
    if r.get("__error__"):
        return None, (r.get("details") or r.get("code") or "ไม่ทราบสาเหตุ")
    return r, ""


def _tree_out(account, tree, error=""):
    tree = tree or {}
    return {
        "mid": account.mid,
        "level": account.lv,
        "nickname": (tree.get("root") or {}).get("nickname") or "",
        # จำนวนคนที่ตั้ง referrer เป็นบัญชีนี้โดยตรง = ตัวเลขที่ฟีเจอร์นี้ดันขึ้น
        "direct_invited": _int(tree.get("direct_invited_count")),
        # รวมทั้งสาย (คนที่คนที่เราชวนไปชวนต่ออีกที)
        "total_invited": _int(tree.get("total_invited_count")),
        "invitation_point": _int(tree.get("invitation_point")),
        "last_rewarded_seq": _int(tree.get("last_rewarded_seq")),
        # ของบัญชีตัวเอง: ยังตั้ง "ใครชวนเรา" ได้อยู่ไหม (ไม่เกี่ยวกับการเชิญคนอื่น)
        "can_set_referrer": bool(tree.get("can_set_referrer")),
        "can_set_referrer_until": tree.get("can_set_referrer_until"),
        "referrer": _node_out(tree.get("parent")),
        # ตัวเลขข้างบนเชื่อถือได้เฉพาะตอน tree_available — ไม่งั้นมันคือศูนย์เพราะ
        # อ่านไม่ได้ ไม่ใช่เพราะยังไม่มีใครถูกเชิญ หน้าเว็บต้องแยกสองกรณีนี้ออก
        "tree_available": bool(tree),
        "tree_error": error,
    }


def _random_nickname():
    """ชื่อเล่นสุ่ม — ไม่รู้ว่าเกมบังคับ unique ไหม ถ้าชนก็ retry ด้วยชื่อใหม่"""
    return "cr" + "".join(random.choices(string.ascii_lowercase + string.digits, k=7))


def _ensure_profile(g):
    """ตั้งโปรไฟล์ให้ guest ก่อนตั้ง referrer — คืน (ok, error)

    ค่าที่ใส่สุ่มจาก enum จริงของเกม ไม่ได้ฮาร์ดโค้ดชุดเดียวทุกตัว เพราะ guest
    ที่โปรไฟล์เหมือนกันเป๊ะเป็นร้อยตัวคือรูปแบบที่มองออกง่ายเกินไป"""
    last = ""
    for _ in range(PROFILE_RETRIES):
        r = g.unary(
            MEMBER_API,
            "SetMemberProfile",
            {
                "common_req": {},
                "member_profile": {
                    "region": random.choice(_REGIONS),
                    "language": random.choice(_LANGUAGES),
                    "gender": random.choice(_GENDERS),
                    "age_group": random.choice(_AGE_GROUPS),
                    "nickname": _random_nickname(),
                },
            },
        )
        if not r.get("__error__"):
            return True, ""
        last = _err_text(r)
    return False, last or "ตั้งโปรไฟล์ guest ไม่สำเร็จ"


def _invite_one(target_mid):
    """สร้าง guest 1 ตัวแล้วตั้ง referrer เป็น target_mid — คืน (bucket, detail)

    ห้าม raise ออกไป เพราะ future ตัวเดียวที่ระเบิดจะลากทั้ง batch ไปด้วย
    (ล้อ create_and_friend_one ของ heart_farm.py)"""
    try:
        rec = create_guest()
        if rec.get("__error__"):
            reason = (
                (rec.get("resp") or {}).get("code")
                or rec.get("network_error")
                or rec.get("raw")
                or "?"
            )
            return "create_fail", str(reason)[:120]

        g = Guest(rec)
        try:
            # ต้องมี member ในเกมก่อน ไม่งั้น RPC ถูกปฏิเสธตั้งแต่ metadata
            g.ensure_game_member()
            ok, err = _ensure_profile(g)
            if not ok:
                return "failed", err
            r = g.unary(
                INVITATION_API,
                "SetReferrer",
                {"common_req": {}, "referrer_player_id": target_mid},
            )
        finally:
            g.close()

        if not r.get("__error__"):
            return "success", g.mid
        err = _err_text(r)
        low = err.lower()
        if any(h in low for h in _ALREADY_HINTS):
            return "already", err
        return "failed", err or "ไม่ทราบสาเหตุ"
    except Exception as e:
        return "failed", str(e)[:120] or e.__class__.__name__


def do_status(account):
    tree, err = _get_tree(account)
    return {"ok": True, "status": _tree_out(account, tree, err)}


def do_invite(target_mid, count, workers):
    """สร้าง guest ขนานกันแล้วนับผลเป็น 4 กอง — สำเร็จ / ตั้งไปแล้ว / ยิงพลาด /
    สร้าง guest ไม่ขึ้น (แยกกองสุดท้ายไว้เพราะมันแปลว่าปัญหาอยู่ที่ proxy หรือ
    rate limit ของ login server ไม่ใช่ที่ไอดีเป้าหมาย)"""
    buckets = {"success": 0, "already": 0, "failed": 0, "create_fail": 0}
    errors = []

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(_invite_one, target_mid) for _ in range(count)]
        for fut in as_completed(futs):
            bucket, detail = fut.result()
            buckets[bucket] += 1
            if bucket in ("failed", "create_fail") and detail and len(errors) < 10:
                errors.append(detail)

    return buckets, errors


def run_invite(target_mid, count, workers, account=None):
    """ยืนยันผลด้วย GetInvitationTree ก่อน/หลัง เมื่อมี credential ของเป้าหมาย
    ด้วยเหตุผลเดียวกับ do_delete/do_accept ใน friend_tool.py — 'ยิงสำเร็จ' ของ
    เซิร์ฟเวอร์ไม่ได้แปลว่ายอดขึ้นจริง"""
    before, _ = _get_tree(account) if account else (None, "")
    buckets, errors = do_invite(target_mid, count, workers)

    after, after_err = _get_tree(account) if account else (None, "")
    # ยอดก่อน/หลังใช้ได้ต่อเมื่ออ่าน tree ได้ "ทั้งสองรอบ" ไม่งั้น gained จะกลาย
    # เป็นตัวเลขมั่ว ๆ ที่ดูน่าเชื่อถือกว่าความจริง
    invited_before = _int(before.get("direct_invited_count")) if before else None
    invited_after = _int(after.get("direct_invited_count")) if after else None
    gained = (invited_after - invited_before) if (before and after) else None

    return {
        "ok": buckets["failed"] == 0 and buckets["create_fail"] == 0,
        "target_mid": target_mid,
        "requested": count,
        "success": buckets["success"],
        "already": buckets["already"],
        "failed": buckets["failed"],
        "create_fail": buckets["create_fail"],
        "invited_before": invited_before,
        "invited_after": invited_after,
        "gained": gained,
        "errors": errors,
        "status": _tree_out(account, after, after_err) if account else None,
    }


def _read_input():
    raw = sys.stdin.read().strip()
    if not raw:
        raise ValueError("ไม่ได้รับ payload ทาง stdin")
    return json.loads(raw)


def _clamp(value, default, lo, hi):
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


def main():
    parser = argparse.ArgumentParser(description="Cookie Run invite (referrer) tool")
    parser.add_argument("--mode", choices=["status", "invite"], required=True)
    args = parser.parse_args()

    with _stdout_to_stderr() as out:
        account = None
        try:
            payload = _read_input()
            email = (payload.get("email") or "").strip()
            password = payload.get("password") or ""
            target_mid = str(payload.get("target_mid") or "").strip()
            _apply_proxy(payload.get("proxy"))

            # มี credential → ล็อกอินเพื่อรู้ MID ที่แน่นอน + ยืนยันยอดก่อน/หลัง
            # ไม่มี → เชิญตาม MID ที่ส่งมาตรง ๆ (โหมดที่ไม่ต้องใช้รหัสผ่าน)
            if email and password:
                account = MainAccount(email, password)
                target_mid = account.mid
            elif args.mode == "status":
                raise ValueError("โหมด status ต้องระบุอีเมลและรหัสผ่าน DevPlay")
            elif not target_mid:
                raise ValueError("ต้องระบุอีเมล+รหัสผ่าน หรือ MID ของไอดีเป้าหมาย")

            if args.mode == "status":
                result = do_status(account)
            else:
                result = run_invite(
                    target_mid,
                    _clamp(payload.get("count"), DEFAULT_INVITES, 1, MAX_INVITES),
                    _clamp(payload.get("workers"), DEFAULT_WORKERS, 1, MAX_WORKERS),
                    account=account,
                )
        except Exception as e:  # ทุก error ออกทาง stdout เป็น JSON เหมือนกันหมด
            _emit(out, {"ok": False, "error": str(e) or e.__class__.__name__})
            return 2
        finally:
            if account is not None:
                account.close()
            _close_guest_channel()

        _emit(out, result)
        return 0


if __name__ == "__main__":
    sys.exit(main())
