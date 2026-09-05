"""ถอดรหัส payload ของ .ds จากไฟล์ capture (HAR) หรือจาก body ที่ก๊อปมาตรง ๆ

ใช้ตอนไล่หา endpoint ที่เรายังไม่รู้ (เช่น "ซื้อกล่องสมบัติ" / "ย่อยเป็นผง"):
เปิด mitmproxy คั่นระหว่าง Cookie Run (มือถือ/อีมูเลเตอร์) กับเซิร์ฟเวอร์ ทำสิ่งนั้น
ในเกม 1 ครั้ง แล้วเอา HAR มาผ่านสคริปต์นี้ — จะได้ path + พารามิเตอร์ที่เกมส่งจริง
พร้อมข้อมูลที่เซิร์ฟเวอร์ตอบกลับ เอาไปเขียนเป็นฟังก์ชันใน heart_farm.py ต่อได้เลย

body ของ .ds เป็น "isEncryptedData=4&data=<blob>" ที่เข้ารหัส ChaCha20 + FastLZ +
urlsafe-base64 ส่วนขาตอบเป็น JSON ที่มี responseData เป็น blob แบบเดียวกัน — โคเดก
ทั้งคู่อยู่ใน heart_farm.py อยู่แล้ว (ds_decode_blob) ไฟล์นี้แค่ห่อให้ใช้กับ capture

ตัวอย่าง:
    python3 ds_decode.py --har capture.har                # ถอดทั้งไฟล์
    python3 ds_decode.py --har capture.har --grep treasure  # เฉพาะที่เข้าคำค้น
    python3 ds_decode.py --body 'isEncryptedData=4&data=...'  # ก้อนเดียว
    pbpaste | python3 ds_decode.py                        # อ่านจาก stdin
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any
from urllib.parse import parse_qs, urlparse

from heart_farm import ds_decode_blob

# โฮสต์ของเกม/DevPlay — ใช้กรองรายการใน HAR ให้เหลือเฉพาะที่เกี่ยวข้อง
_GAME_HOSTS = ("devsnova.cloud", "devplay.com")


def _decode_blob(blob: str) -> Any:
    """blob -> JSON (ถ้าถอดแล้วไม่ใช่ JSON ก็คืนเป็นข้อความดิบ)"""
    plain = ds_decode_blob(blob).decode("utf-8", "replace")
    try:
        return json.loads(plain)
    except ValueError:
        return plain


def decode_request_body(body: str) -> Any:
    """รับ body ของ request ทั้งก้อน (หรือเฉพาะ blob) แล้วคืนพารามิเตอร์ที่ถอดแล้ว"""
    body = (body or "").strip()
    if not body:
        raise ValueError("body ว่าง")
    if "data=" in body:
        values = parse_qs(body).get("data") or []
        if not values:
            raise ValueError("ไม่พบพารามิเตอร์ data ใน body")
        blob = values[0]
    else:
        blob = body           # ก๊อปมาเฉพาะ blob ก็รับได้
    return _decode_blob(blob)


def decode_response_body(body: str) -> Any:
    """ขาตอบเป็น JSON ปกติ แต่ responseData ข้างในเป็น blob — ถอดให้ในที่เดิม"""
    body = (body or "").strip()
    if not body:
        return None
    try:
        obj = json.loads(body)
    except ValueError:
        return decode_request_body(body)      # บาง capture เก็บมาเป็น blob ล้วน
    if isinstance(obj, dict) and obj.get("responseData"):
        obj["responseData"] = _decode_blob(obj["responseData"])
    return obj


def _entries(har: dict[str, Any]) -> list[dict[str, Any]]:
    return (har.get("log") or {}).get("entries") or []


def _text(section: dict[str, Any]) -> str:
    return ((section or {}).get("postData") or section or {}).get("text") or ""


def walk_har(path: str, grep: str = "", include_all: bool = False) -> list[dict[str, Any]]:
    """ถอดทุกคำขอที่ยิงไปหาเซิร์ฟเวอร์เกมในไฟล์ HAR"""
    with open(path, encoding="utf-8") as fh:
        har = json.load(fh)

    out: list[dict[str, Any]] = []
    for entry in _entries(har):
        req = entry.get("request") or {}
        url = req.get("url") or ""
        host = urlparse(url).netloc
        if not include_all and not any(h in host for h in _GAME_HOSTS):
            continue

        item: dict[str, Any] = {
            "method": req.get("method"),
            "url": url,
            "status": (entry.get("response") or {}).get("status"),
        }
        for label, raw, decode in (
            ("request", _text(req), decode_request_body),
            ("response", ((entry.get("response") or {}).get("content") or {}).get("text", ""), decode_response_body),
        ):
            if not raw:
                continue
            try:
                item[label] = decode(raw)
            except Exception as e:
                # ถอดไม่ออกไม่ใช่เรื่องแปลก (gRPC/รูป/ไฟล์อื่น) — บอกไว้แล้วไปต่อ
                item[label] = f"<ถอดไม่ได้: {type(e).__name__}: {e}>"

        if grep and grep.lower() not in json.dumps(item, ensure_ascii=False).lower():
            continue
        out.append(item)
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="ถอด payload ของ .ds จาก capture")
    ap.add_argument("--har", help="ไฟล์ .har ที่ export จาก mitmproxy/Charles")
    ap.add_argument("--body", help="body ของ request ก้อนเดียว (หรือ blob ล้วน)")
    ap.add_argument("--grep", default="", help="เก็บเฉพาะรายการที่มีคำนี้ (ไม่สนตัวพิมพ์)")
    ap.add_argument("--all-hosts", action="store_true",
                    help="ไม่กรองโฮสต์ (ปกติเอาเฉพาะ devsnova/devplay)")
    args = ap.parse_args(argv)

    if args.har:
        items = walk_har(args.har, grep=args.grep, include_all=args.all_hosts)
        print(json.dumps(items, ensure_ascii=False, indent=2))
        print(f"\n// {len(items)} รายการ", file=sys.stderr)
        return 0

    body = args.body or sys.stdin.read()
    print(json.dumps(decode_request_body(body), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
