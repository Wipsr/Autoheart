"""
============================================================================
 Cookie Run — SHOP RECON (recon tool, ไม่ใช่ฟีเจอร์ production)
============================================================================
 จุดประสงค์: หาว่า "กล่องสมบัติ" ที่ซื้อด้วยเหรียญแล้วย่อยเป็นผงเวทมนตร์ได้
 ขายอยู่ที่ไหน และซื้อผ่าน API ไหน — เพื่อจะทำฟีเจอร์ปั๊มผงให้ตรงกลไกจริง

 ที่มา: หน้าเว็บของ ngmx บอกกลไกไว้ว่า "ซื้อกล่องสมบัติด้วยเหรียญในเกมของคุณ
 ย่อยเป็นผงจนถึงเป้า" (กล่องละ ~5000 เหรียญ ได้ผงเฉลี่ย ~9) แต่ _descriptors.bin
 ไม่มีเมธอด gRPC สำหรับ "ซื้อกล่อง" หรือ "ย่อยเป็นผง" ตรง ๆ มีแต่ ShopAPI
 ทั่วไป — สคริปต์นี้จึงไปถามเซิร์ฟเวอร์ว่าร้านมีอะไรขายบ้าง แทนการเดาชื่อ
 endpoint แล้วยิงมั่ว

 !! อ่านอย่างเดียว !! ไม่ซื้อ ไม่ใช้เหรียญ ไม่แก้อะไรในบัญชีทั้งสิ้น
 (ไม่เรียก BuyFromShop / ResetStocks ซึ่งเป็นตัวที่เสียของจริง)

 รับ input ทาง stdin เป็น JSON บรรทัดเดียว (ไม่ส่งรหัสผ่านทาง argv):

   echo '{"email":"a@b.c","password":"..."}' | python shop_recon.py

 เพิ่มชื่อร้านที่อยากลองเองได้ (ดีฟอลต์ลองเท่าที่จำเป็น):

   echo '{"email":"...","password":"...","shops":["shop","treasure"]}' \
       | python shop_recon.py

 คืนผลเป็น JSON ก้อนเดียวทาง stdout; log ที่มนุษย์อ่านไป stderr
============================================================================
"""
from __future__ import annotations

import contextlib
import json
import sys

from heart_farm import MainAccount

SHOP_SERVICE = "service.api.ShopAPI"

# ListOffers บังคับให้ระบุชื่อร้าน แต่เราไม่รู้ว่าเซิร์ฟเวอร์ตั้งชื่อร้านว่าอะไร
# "" มาก่อนเสมอ เผื่อเซิร์ฟเวอร์ตีความว่า "ทุกร้าน" — ที่เหลือเป็นชื่อที่พบบ่อย
# ในเกมแนวนี้ ตั้งใจให้สั้น เพราะนี่คือการเดา และการเดาควรมีต้นทุนต่ำ
DEFAULT_SHOPS = ["", "shop", "coin", "coin_shop", "treasure", "treasure_shop", "daily"]

# ประเภทเงินที่เราสนใจ — กล่องที่ ngmx ซื้อจ่ายด้วยเหรียญ
COIN = "MONEY_TYPE_COIN"


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


def _safe(fn):
    try:
        return {"ok": True, "data": fn()}
    except Exception as e:  # noqa: BLE001 -- recon tool, อยากเห็น error ทุกแบบ
        return {"ok": False, "error": "%s: %s" % (type(e).__name__, e)}


def _offers(acct, shop_name):
    """ถามรายการของขายในร้านหนึ่ง — คืน None ถ้าเซิร์ฟเวอร์ปฏิเสธชื่อร้านนี้"""
    r = acct.unary(SHOP_SERVICE, "ListOffers", {"common_req": {}, "shop_name": shop_name})
    if r.get("__error__"):
        return None, r
    return r.get("offerStates") or [], None


def _wallet_keys(data, prefix="", out=None, depth=0):
    """ไล่ดูว่า initMember3 เก็บ wallet/คลังสมบัติไว้ตรงไหน — เอาแค่ชื่อคีย์กับชนิด
    ไม่เอาค่า เพื่อไม่ให้ผล dump พกข้อมูลบัญชีเกินจำเป็น"""
    if out is None:
        out = []
    if depth > 3 or not isinstance(data, dict):
        return out
    for k, v in data.items():
        path = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.append({"path": path, "type": "object", "keys": len(v)})
            _wallet_keys(v, path, out, depth + 1)
        elif isinstance(v, list):
            out.append({"path": path, "type": "list", "len": len(v)})
        else:
            out.append({"path": path, "type": type(v).__name__})
    return out


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

        shops = payload.get("shops") or DEFAULT_SHOPS
        out = {"ok": True}
        acct = None
        try:
            acct = MainAccount(email, password)
            out["basic"] = {"mid": acct.mid, "member_seq": acct.member_seq, "lv": acct.lv}

            # 1) ร้านมีอะไรบ้างตามที่เซิร์ฟเวอร์บอกเอง (ไม่ต้องเดา)
            out["shop_info"] = _safe(
                lambda: acct.unary(SHOP_SERVICE, "GetShopInfo", {"common_req": {}})
            )

            # 2) ไล่ถามของขายทีละร้าน เก็บเฉพาะร้านที่ตอบจริง
            found = {}
            rejected = {}
            for name in shops:
                offers, err = _offers(acct, name)
                if offers is None:
                    rejected[name or "(empty)"] = err.get("details") or err.get("code")
                    continue
                found[name or "(empty)"] = offers
                print("  [recon] shop %-16r -> %d offers" % (name, len(offers)))
            out["offers_by_shop"] = found
            out["shops_rejected"] = rejected

            # 3) สรุปเฉพาะของที่ซื้อด้วย "เหรียญ" — กล่องสมบัติที่ ngmx ซื้อควรอยู่ในนี้
            coin_offers = [
                {
                    "shop_name": o.get("shop_name"),
                    "seq": o.get("seq"),
                    "stuff_seq": o.get("stuff_seq"),
                    "price": o.get("price"),
                    "image_tag": o.get("image_tag"),
                    "message": o.get("message"),
                    "buy_limit": o.get("buy_limit"),
                    "is_available": o.get("is_available"),
                }
                for offers in found.values()
                for o in offers
                if o.get("money_type") == COIN
            ]
            # ราคาใกล้ 5000 ที่สุดน่าสงสัยที่สุด เรียงให้ดูง่าย
            coin_offers.sort(key=lambda o: abs(int(o.get("price") or 0) - 5000))
            out["coin_offers"] = coin_offers

            # 4) โครงของ initMember3 — หาว่ายอดผง/คลังสมบัติอยู่คีย์ไหน
            out["init_member_shape"] = _safe(
                lambda: _wallet_keys(getattr(acct, "init_data", None) or {})
            )
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
