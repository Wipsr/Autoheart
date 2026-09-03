"""
============================================================================
 Cookie Run — DS PROBE (recon tool, ไม่ใช่ฟีเจอร์ production)
============================================================================
 จุดประสงค์: ดูรูปแบบข้อมูลของ endpoint ฝั่ง DS (.ds) เพื่อจะเขียนฟีเจอร์
 ปั๊มผงเวทมนตร์ให้ตรงกลไกจริง — ซื้อกล่องสมบัติด้วยเหรียญแล้วย่อยเป็นผง

 รายชื่อ endpoint ทั้ง 85 ตัวได้มาจากการแกะ string ในไฟล์เกม (v26.8.02)
 ตัวที่เกี่ยวกับฟีเจอร์นี้คือ:
   shop/buyTreasureSet.ds   ซื้อกล่องสมบัติ   <- เขียนข้อมูล เสียเหรียญ
   shop/breakStuff.ds       ย่อยของเป็นผง     <- เขียนข้อมูล ของหายจริง
   member/myInventoryItem.ds  ดูคลังของ       <- อ่านอย่างเดียว

 !! สคริปต์นี้ยิงได้เฉพาะที่อยู่ใน READ_ONLY เท่านั้น !!
 ตัวที่ "เขียน" (buyTreasureSet / breakStuff / sellStuff / upgradeTreasure …)
 จงใจไม่ใส่ไว้ เพราะเรียกพลาดครั้งเดียวคือเหรียญหายหรือของถูกย่อยจริง กู้ไม่ได้
 เวลาจะทดลองตัวเขียน ต้องเพิ่มด้วยมือพร้อมตั้งใจ ไม่ใช่หลุดไปโดยบังเอิญ

 รับ input ทาง stdin เป็น JSON บรรทัดเดียว (ไม่ส่งรหัสผ่านทาง argv):

   echo '{"email":"a@b.c","password":"..."}' | python ds_probe.py

 เลือกเฉพาะบาง endpoint ได้:

   echo '{"email":"...","password":"...","only":["member/myInventoryItem.ds"]}' \
       | python ds_probe.py
============================================================================
"""
from __future__ import annotations

import contextlib
import json
import sys

from heart_farm import MainAccount

# allowlist: เฉพาะ endpoint ที่ชื่อบอกชัดว่าเป็นการ "อ่าน" เท่านั้น
READ_ONLY = [
    "member/myInventoryItem.ds",   # คลังของ — ดูว่าสมบัติหน้าตายังไง อ้างด้วยอะไร
    "shop/cashItemList.ds",        # รายการของขาย — เผื่อบอกราคากล่องสมบัติ
    "check/serverTime.ds",         # ตัวคุม: ถ้าตัวนี้ยังพัง แปลว่าปัญหาอยู่ที่ envelope
]

# ก้อน response บาง endpoint ใหญ่มาก (คลังของ 394 ชิ้น) เก็บตัวอย่างพอเห็นรูปแบบ
SAMPLE_ITEMS = 5


@contextlib.contextmanager
def _stdout_to_stderr():
    real = sys.stdout
    sys.stdout = sys.stderr
    try:
        yield real
    finally:
        sys.stdout = real


def _emit(stream, payload):
    stream.write(json.dumps(payload, ensure_ascii=False) + "\n")
    stream.flush()


def _shrink(value, depth=0):
    """ย่อ response ให้เหลือแค่ 'รูปร่าง' + ตัวอย่างไม่กี่ชิ้น

    ดูรูปแบบข้อมูลคือเป้าหมาย ไม่ใช่เนื้อข้อมูลของบัญชี — และก้อนเต็มยาวเกิน
    จะอ่านไหวอยู่ดี
    """
    if isinstance(value, list):
        out = {"__list__": len(value)}
        if value:
            out["sample"] = [_shrink(v, depth + 1) for v in value[:SAMPLE_ITEMS]]
        return out
    if isinstance(value, dict):
        if depth >= 3:
            return {"__keys__": sorted(value)[:40]}
        return {k: _shrink(v, depth + 1) for k, v in value.items()}
    return value


def main():
    with _stdout_to_stderr() as real_stdout:
        try:
            payload = json.loads(sys.stdin.read() or "{}")
        except json.JSONDecodeError:
            _emit(real_stdout, {"ok": False, "error": "invalid stdin json"})
            return 1

        email = (payload.get("email") or "").strip()
        password = payload.get("password") or ""
        if not email or not password:
            _emit(real_stdout, {"ok": False, "error": "email/password required"})
            return 1

        only = payload.get("only")
        targets = [p for p in READ_ONLY if not only or p in only]
        blocked = [p for p in (only or []) if p not in READ_ONLY]

        out = {"ok": True, "probed": targets}
        if blocked:
            # บอกให้ชัดว่าปฏิเสธอะไรไป จะได้ไม่นึกว่ายิงไปแล้วแต่เงียบ
            out["refused"] = {
                "endpoints": blocked,
                "reason": "ไม่อยู่ใน READ_ONLY — เป็น endpoint ที่เขียนข้อมูล ต้องเพิ่มด้วยมือ",
            }

        acct = None
        try:
            acct = MainAccount(email, password)
            out["basic"] = {"mid": acct.mid, "member_seq": acct.member_seq, "lv": acct.lv}
            results = {}
            for path in targets:
                try:
                    res = acct.ds_call(path)
                    results[path] = {
                        "ok": True,
                        "code": res.get("code"),
                        "data": _shrink(res.get("data")),
                    }
                    print("  [probe] %-30s code=%s" % (path, res.get("code")))
                except Exception as e:  # noqa: BLE001 -- recon, อยากเห็น error ทุกแบบ
                    results[path] = {"ok": False, "error": "%s: %s" % (type(e).__name__, e)}
                    print("  [probe] %-30s FAILED %s" % (path, e))
            out["results"] = results
        except Exception as e:  # noqa: BLE001
            out = {"ok": False, "error": "%s: %s" % (type(e).__name__, str(e)[:400])}
        finally:
            if acct is not None:
                with contextlib.suppress(Exception):
                    acct.close()

        _emit(real_stdout, out)
        return 0 if out.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
