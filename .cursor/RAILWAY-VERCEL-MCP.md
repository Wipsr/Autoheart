# Railway MCP + Vercel MCP — วิธีเชื่อม

ตอบสั้น ๆ: **เชื่อมได้ทั้งคู่** และเชื่อมพร้อมกันในไฟล์ config เดียวได้ด้วย
ทั้ง Railway และ Vercel มี MCP server อย่างเป็นทางการแบบ **remote HTTP + OAuth**
เลยไม่ต้องใส่ API token ลงไฟล์ในโปรเจกต์เลย

| Service | Endpoint | Auth | เอาไว้ทำอะไรกับ Autoheart |
|---|---|---|---|
| Railway | `https://mcp.railway.com` | OAuth ตอนเชื่อมครั้งแรก | ดู deploy/logs ของ `backend`, เช็ค env vars, restart service |
| Vercel  | `https://mcp.vercel.com`  | OAuth ตอนเชื่อมครั้งแรก | ดู build/deployment ของ `frontend`, อ่าน build log, ตั้ง env vars |

> Railway ยังไม่รองรับ project token กับ remote MCP — ต้อง login ด้วย user จริง
> เพราะผูกกับ billing/audit trail

## Config ในโปรเจกต์นี้

ใส่ให้แล้วทั้งสองที่:

- `.cursor/mcp.json` — สำหรับ Cursor
- `.mcp.json` (root) — สำหรับ Claude Code (project scope)

```json
{
  "mcpServers": {
    "railway": { "type": "http", "url": "https://mcp.railway.com" },
    "vercel":  { "type": "http", "url": "https://mcp.vercel.com" }
  }
}
```

## Cursor

1. เปิดโฟลเดอร์ `Autoheart` เป็น workspace root
2. **Developer: Reload Window**
3. **Cursor Settings → MCP** จะเห็น `railway` / `vercel` ขึ้น **Needs auth** → กด Connect แล้ว login ผ่านเบราว์เซอร์
4. ถ้ายังไม่ขึ้น ให้ปิด-เปิด Cursor ใหม่ (เช็คลิสต์เดียวกับ `CLOUDFLARE-MCP.md`)

## Claude Code

มี `.mcp.json` อยู่ที่ root แล้ว แค่เปิด `claude` ในโฟลเดอร์นี้ แล้วกด approve
project MCP servers ครั้งแรก จากนั้นพิมพ์ `/mcp` เพื่อ authenticate

หรือจะเพิ่มเองก็ได้:

```bash
claude mcp add railway --transport http https://mcp.railway.com
claude mcp add vercel  --transport http https://mcp.vercel.com
```

## ทางเลือก: Railway แบบ local (ผ่าน CLI)

remote MCP ของ Railway มี tool แค่ subset (projects, deployments, feature flags, agent)
ถ้าต้องยุ่งกับ domains / networking / volumes / observability ละเอียด ๆ ให้ใช้แบบ local
ซึ่งมี ~50 tools แต่ต้องลง Railway CLI และ `railway login` ก่อน

```bash
bash <(curl -fsSL https://railway.com/install.sh)
railway login
railway mcp install            # local stdio
railway mcp install --remote   # หรือชี้ไป remote endpoint
```

config แบบ local:

```json
{ "mcpServers": { "railway": { "command": "railway", "args": ["mcp"] } } }
```

> package เก่า `npx -y @railway/mcp-server` เป็นแค่ shim ที่ delegate ไป `railway mcp`
> ถ้าเจอ config เก่าที่ยังเรียกแบบนั้นอยู่ ให้เปลี่ยนมาใช้ 2 แบบข้างบนแทน

## ข้อควรระวังเฉพาะโปรเจกต์นี้

- **อย่าให้ agent สั่ง scale `backend` เกิน 1 replica** — `job_runner_service` เป็น singleton
  ถ้ามี worker สองตัว จะแย่ง job เดียวกัน (เคยพังจริง ดู README หัวข้อ Dev workflow)
- **อย่าเปิด App Sleeping** ผ่าน MCP — worker loop ต้องตื่นตลอด
- `CREDENTIALS_ENCRYPTION_KEY` ห้ามให้ agent เปลี่ยน ไม่งั้นถอดรหัส DevPlay password เดิมไม่ออก
- MCP ทั้งสองตัวมีสิทธิ์เท่ากับ account ที่ login เลย — เปิด human confirmation
  ก่อนให้รัน tool ที่เป็น deploy / delete / แก้ env
- ถ้าเปลี่ยน Vercel domain อย่าลืมอัปเดต `CORS_ORIGINS` ที่ Railway ให้ตรงกัน

## อ้างอิง

- Vercel MCP: https://vercel.com/docs/agent-resources/vercel-mcp
- Railway MCP: https://docs.railway.com/ai/mcp-server
- Railway CLI `railway mcp`: https://docs.railway.com/cli/mcp
