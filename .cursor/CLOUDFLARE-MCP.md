# Cloudflare MCP ไม่ขึ้น — เช็คลิสต์

1. Cursor อ่าน MCP จาก **ทั้งสองที่** (ขึ้นกับเวอร์ชัน):
   - โปรเจกต์: `Autoheart/.cursor/mcp.json`
   - ทั้งเครื่อง: `~/.cursor/mcp.json` (macOS: `/Users/<you>/.cursor/mcp.json`)

2. หลังแก้ไฟล์: **Developer: Reload Window**

3. เปิด **Cursor Settings → MCP** ดู `cloudflare` และ `cloudflare-docs`
   - `cloudflare-docs` มักใช้ได้ทันที (ไม่ต้องล็อกอิน)
   - `cloudflare` ครั้งแรกอาจขึ้น **Needs auth** → กด Connect / ล็อกอิน Cloudflare

4. ถ้ายังไม่ขึ้น: ปิด Cursor แล้วเปิดใหม่ เปิดโฟลเดอร์ `Autoheart` เป็น workspace root

5. รอ nameserver ที่ Cloudflare ไม่เกี่ยวกับ MCP — แค่รอ zone Active ก่อนตั้ง DNS/Tunnel
