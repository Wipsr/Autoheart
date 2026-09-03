"""
============================================================================
 Cookie Run — ACCOUNT DUMP (recon tool, ไม่ใช่ฟีเจอร์ production)
============================================================================
 จุดประสงค์: ล็อกอิน DevPlay หนึ่งครั้งด้วยบัญชีทดสอบ แล้ว "เท" response ดิบ
 ของทุก endpoint ที่หน้า ngmx /#/account น่าจะใช้ ออกมาเป็น JSON เพื่อดูว่า
 wallet / inventory อยู่ในก้อนไหน โดยเฉพาะ member/initMember3.ds ที่ปกติ
 heart_farm.py อ่านแค่ 3 ฟิลด์แล้วทิ้งที่เหลือ

 รับ input ทาง stdin เป็น JSON บรรทัดเดียว (ไม่ส่งรหัสผ่านทาง argv):

   echo '{"email":"a@b.c","password":"..."}' | python dump_account.py

 คืนผลเป็น JSON ก้อนเดียวทาง stdout; log ที่มนุษย์อ่านไป stderr
============================================================================
"""
from __future__ import annotations

import contextlib
import json
import sys

import heart_farm as hf
from heart_farm import MainAccount, _ds_init_member, fresh_lc


@contextlib.contextmanager
def _stdout_to_stderr():
    real = sys.stdout
    sys.stdout = sys.stderr
    try:
        yield real
    finally:
        sys.stdout = real


def _safe(label, fn):
    """เรียก fn() แล้วห่อผลลัพธ์/ข้อผิดพลาดไว้ ไม่ให้ endpoint เดียวพังทั้ง dump"""
    try:
        return {"ok": True, "data": fn()}
    except Exception as e:  # noqa: BLE001 -- recon tool, อยากเห็น error ทุกแบบ
        return {"ok": False, "error": "%s: %s" % (type(e).__name__, e)}


def _raw_init_member(email, password):
    """ล็อกอินเองแบบ manual เพื่อคว้า response ดิบทั้งก้อนของ initMember3
    (MainAccount.__init__ เรียก _ds_init_member ให้ แต่โยน data ที่เหลือทิ้ง)"""
    lc = fresh_lc()
    lc["devsisters_id"] = ""

    # ยืม _login ของ MainAccount แต่ไม่อยากให้มันวิ่ง initMember + เปิด gRPC channel
    # เลย login แยกด้วย urllib ตรง ๆ ตามสูตรเดียวกับ heart_farm._login
    import urllib.request

    headers = hf.auth_headers(lc)

    def _post(path, obj):
        data = json.dumps(obj).encode()
        req = urllib.request.Request(hf.AUTH_HOST + "/" + path, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())

    _post("v4/checkemail", {"email": email, "lc": lc})
    d = _post("v3/login/devsisters", {"email": email, "password": password, "oven_access_token": "", "lc": lc})
    tok = d.get("game_access_token")
    if not tok:
        raise RuntimeError("login failed code=%s" % d.get("code"))
    member = d.get("member") or {}
    mid = member.get("mid")
    session = {"access_token": tok}
    raw = _ds_init_member(mid, lc, session)  # <- คืน data ทั้งก้อน
    return {"login_member": member, "init_member_full": raw}


def main():
    with _stdout_to_stderr() as real_stdout:
        try:
            payload = json.loads(sys.stdin.read() or "{}")
        except json.JSONDecodeError:
            _emit(real_stdout, {"ok": False, "error": "invalid stdin json"})
            return

        email = (payload.get("email") or "").strip()
        password = payload.get("password") or ""
        if not email or not password:
            _emit(real_stdout, {"ok": False, "error": "email/password required"})
            return

        out = {"ok": True}

        # 1) initMember3 ดิบ — จุดที่คาดว่ามี wallet/inventory
        out["init_member"] = _safe("initMember3", lambda: _raw_init_member(email, password))

        # 2) เปิด session เต็มผ่าน MainAccount เพื่อยิง gRPC endpoint อื่น ๆ
        main_acct = None
        try:
            main_acct = MainAccount(email, password)
            out["basic"] = {"mid": main_acct.mid, "member_seq": main_acct.member_seq, "lv": main_acct.lv}

            out["member_summary"] = _safe("GetMemberSummary", lambda: main_acct.unary(
                "service.api.MemberAPI", "GetMemberSummary", {"common_req": {}}))
            out["invitation_tree"] = _safe("GetInvitationTree", lambda: main_acct.unary(
                "service.api.InvitationAPI", "GetInvitationTree", {"common_req": {}}))
            out["gift_mail"] = _safe("ListGiftMail", lambda: main_acct.unary(
                "service.api.GiftMailAPI", "ListGiftMail", {"common_req": {}}))
            out["mail_list_ds"] = _safe("myMailList.ds", lambda: main_acct.ds_call("game/myMailList.ds"))
        finally:
            if main_acct is not None:
                with contextlib.suppress(Exception):
                    main_acct.close()

        _emit(real_stdout, out)


def _emit(stream, payload):
    # ตัด value ที่ยาวมาก ๆ (เช่น token/binary) ให้อ่านง่าย แต่คงโครงสร้าง key ไว้ครบ
    stream.write(json.dumps(payload, ensure_ascii=False, default=str))
    stream.write("\n")
    stream.flush()


if __name__ == "__main__":
    main()
