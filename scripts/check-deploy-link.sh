#!/usr/bin/env bash
# ตรวจว่า frontend บน Vercel กับ backend บน Railway ต่อกันได้จริง
#
#   ./scripts/check-deploy-link.sh
#   ./scripts/check-deploy-link.sh https://autoheart.vercel.app https://autoheart-production.up.railway.app
#
# เช็ค 4 อย่างที่พังบ่อยตอน deploy: backend ตื่นอยู่ไหม, CORS ยอมรับโดเมน
# Vercel ไหม, API ตอบข้อมูลจริงไหม, และ WebSocket ผ่าน proxy ของ Railway ไหม
set -uo pipefail

FRONTEND="${1:-https://autoheart.vercel.app}"
API="${2:-https://autoheart-production.up.railway.app}"
FRONTEND="${FRONTEND%/}"
API="${API%/}"

pass=0
fail=0

ok()   { printf '  \033[32mOK\033[0m    %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=$((fail + 1)); }

echo "frontend : $FRONTEND"
echo "backend  : $API"
echo

# 1) backend ตื่นอยู่ (App Sleeping ปิด + health check ผ่าน)
health=$(curl -sS -m 20 "$API/health" 2>/dev/null)
if [[ "$health" == *'"ok":true'* ]]; then
  ok "backend /health ตอบแล้ว"
else
  bad "backend /health ไม่ตอบ หรือตอบผิดรูป: ${health:-<ว่าง>}"
fi

# 2) CORS — เบราว์เซอร์ยิง preflight ก่อนทุก POST ที่มี Authorization header
allow=$(curl -sS -m 20 -o /dev/null -D- -X OPTIONS \
  -H "Origin: $FRONTEND" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  "$API/api/jobs/create" 2>/dev/null |
  tr -d '\r' | awk 'tolower($1) == "access-control-allow-origin:" { print $2 }')
if [[ "$allow" == "$FRONTEND" ]]; then
  ok "CORS preflight ผ่าน (allow-origin: $allow)"
else
  bad "CORS ไม่ยอมรับ $FRONTEND — ใส่โดเมนนี้ใน CORS_ORIGINS ที่ Railway"
fi

# 3) API ตอบข้อมูลจริง ไม่ใช่แค่ health
packages=$(curl -sS -m 20 -H "Origin: $FRONTEND" "$API/api/packages" 2>/dev/null)
if [[ "$packages" == \[*\] && "$packages" != "[]" ]]; then
  ok "GET /api/packages ส่งข้อมูลกลับมา"
else
  bad "GET /api/packages ไม่ส่งข้อมูล — เช็ค SUPABASE_* ที่ Railway: ${packages:0:120}"
fi

# 4) WebSocket — token ปลอมต้องโดนปฏิเสธ (403 = handshake ถึง route แล้ว)
#    ถ้าเจอ 404/502 แปลว่า proxy หรือ path ไม่ถึง backend
ws_code=$(curl -sS -m 20 -o /dev/null -w '%{http_code}' --http1.1 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "$API/ws/queue?token=invalid" 2>/dev/null)
if [[ "$ws_code" == "403" || "$ws_code" == "101" ]]; then
  ok "WebSocket handshake ถึง backend (HTTP $ws_code)"
else
  bad "WebSocket ไม่ถึง backend (HTTP $ws_code) — เช็ค NEXT_PUBLIC_WS_URL ว่าเป็น wss://"
fi

# 5) frontend ที่ deploy แล้ว build มาด้วย API URL ตัวนี้จริงไหม
html=$(curl -sS -m 25 "$FRONTEND/" 2>/dev/null)
chunks=$(printf '%s' "$html" | grep -o '/_next/static/[^"]*\.js' | sort -u)
found=""
for chunk in $chunks; do
  # -F: $API มี "." เต็มไปหมด ถ้าปล่อยเป็น regex จุดจะ match อะไรก็ได้
  if curl -sS -m 20 "$FRONTEND$chunk" 2>/dev/null | grep -qF -- "$API"; then
    found="$chunk"
    break
  fi
done
if [[ -n "$found" ]]; then
  ok "bundle ของ Vercel ชี้มาที่ $API"
else
  bad "ไม่เจอ $API ใน bundle — ตั้ง NEXT_PUBLIC_API_URL ที่ Vercel แล้ว redeploy"
fi

echo
echo "ผ่าน $pass / ไม่ผ่าน $fail"
[[ "$fail" -eq 0 ]]
