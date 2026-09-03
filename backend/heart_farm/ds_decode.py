"""
============================================================================
 Cookie Run — DS BLOB DECODER (เครื่องมือช่วยแกะ ไม่ใช่ฟีเจอร์ production)
============================================================================
 ถอดก้อนข้อมูลที่เข้ารหัสของ DS ให้กลับเป็น JSON อ่านได้ ใช้ตอนดัก traffic
 จากแอปเกมจริง เพื่อดูว่า endpoint หนึ่ง ๆ รับ/คืน field อะไรบ้าง

 ทำไมต้องมี: traffic ที่ดักได้จะไม่ใช่ JSON แต่เป็นก้อน base64 ที่ผ่าน
 ChaCha20 + FastLZ มาแล้ว (ดู PART 1 ของ heart_farm.py) ตาเปล่าอ่านไม่ออก

 รับได้ทุกแบบที่ก๊อปมาจาก proxy โดยไม่ต้องตัดแต่งเอง:
   1. ก้อน base64 ล้วน                     AbC123...
   2. body ของ request ทั้งอัน             isEncryptedData=1&data=AbC123...
   3. response ทั้งอัน                     {"responseCode":200,"responseData":"AbC..."}
 รองรับทั้งแบบที่ผ่าน URL-encode มาแล้วและยังไม่ผ่าน

 วิธีใช้ — วางก้อนที่ดักมาทาง stdin:

   pbpaste | python ds_decode.py                  (mac)
   Get-Clipboard | python ds_decode.py            (windows powershell)
   python ds_decode.py < captured.txt

 ไม่ต้องใช้อีเมล/รหัสผ่าน และไม่ต่อเน็ตออกไปไหน — ถอดรหัสในเครื่องล้วน ๆ
============================================================================
"""
from __future__ import annotations

import json
import sys
import urllib.parse

from heart_farm import ds_decode_blob


def _candidates(raw: str):
    """ดึง 'ก้อนที่น่าจะเป็น blob' ออกมาจากสิ่งที่ผู้ใช้วางมา เรียงตามความน่าจะเป็น"""
    raw = (raw or "").strip()
    if not raw:
        return []

    out = []

    # แบบที่ 3: response ทั้งอัน — เอา responseData ออกมา
    if raw.startswith("{"):
        try:
            obj = json.loads(raw)
            for key in ("responseData", "data"):
                if isinstance(obj.get(key), str):
                    out.append((f"{key} ของ response", obj[key]))
        except json.JSONDecodeError:
            pass

    # แบบที่ 2: form body — แกะพารามิเตอร์ data ออกมา
    if "data=" in raw:
        for key, values in urllib.parse.parse_qs(raw, keep_blank_values=True).items():
            if key.strip().endswith("data") and values and values[0]:
                out.append((f"พารามิเตอร์ {key}", values[0]))

    # แบบที่ 1: ก้อนล้วน (เผื่อผ่าน url-encode มา ก็คลายให้ก่อน)
    out.append(("ก้อนที่วางมาทั้งก้อน", raw))
    unquoted = urllib.parse.unquote_plus(raw)
    if unquoted != raw:
        out.append(("ก้อนที่วางมา (คลาย url-encode แล้ว)", unquoted))

    return out


def main() -> int:
    raw = sys.stdin.read()
    tried = _candidates(raw)
    if not tried:
        print("ไม่มีข้อมูลเข้ามาทาง stdin", file=sys.stderr)
        return 1

    errors = []
    for label, blob in tried:
        blob = blob.strip().strip('"').strip("'")
        if not blob:
            continue
        try:
            plain = ds_decode_blob(blob).decode("utf-8", errors="replace")
        except Exception as e:  # noqa: BLE001 -- ลองหลายแบบ ตัวไหนไม่ผ่านก็ข้าม
            errors.append(f"  - {label}: {type(e).__name__}: {e}")
            continue

        print(f"# ถอดสำเร็จจาก: {label}", file=sys.stderr)
        try:
            # จัดรูปให้อ่านง่ายถ้าเป็น JSON (ปกติเป็น) ไม่งั้นพ่นดิบ ๆ
            print(json.dumps(json.loads(plain), ensure_ascii=False, indent=2, sort_keys=True))
        except json.JSONDecodeError:
            print(plain)
        return 0

    print("ถอดรหัสไม่สำเร็จสักแบบ — ลองแล้วดังนี้:", file=sys.stderr)
    for line in errors:
        print(line, file=sys.stderr)
    print(
        "\nเช็กว่าก๊อปมาครบทั้งก้อนไหม (ก้อนพวกนี้ยาวมาก proxy บางตัวตัดท้ายให้)",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
