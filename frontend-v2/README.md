# frontend-v2

หน้าเว็บชุดใหม่ของ Autoheart — ฟังก์ชันเท่าเดิมกับ `frontend/` ทุกอย่าง
เปลี่ยนสองเรื่อง: **ดีไซน์เป็นโทนสว่าง** และ **สกุลเงินเป็นพอยท์ (Point)**

Backend เดิม (FastAPI บน Railway) ใช้ร่วมกัน ไม่มีการแยก API

## ต่างจาก `frontend/` ยังไง

| | `frontend/` (v1) | `frontend-v2/` |
|---|---|---|
| ธีม | ดำ + ชมพู | สว่าง `#FAFAF8` + ทอง |
| ฟอนต์ | Chakra Petch + IBM Plex Sans Thai | Anuphan (หัวข้อ + เนื้อความ) + IBM Plex Mono |
| สกุลเงิน | เครดิตหัวใจ (`profile.credits`) | พอยท์ (`profile.points`) |
| ปุ่ม | สีพื้นเรียบ | ไล่เฉด + ขอบ + เงา แบบ SaaS |
| คิวรวม | ตัวเลข `#3` | แถบคิวทั้งระบบ (`QueueStrip`) |

## กติกาสี — จำข้อเดียว

**ทองคือพอยท์** ใช้กับยอดพอยท์ ราคา และปุ่มหลักเท่านั้น
สถานะงานมีชุดสีของตัวเองแยกออกไป: เขียว = กำลังรัน, คราม = รอคิว, แดง = ล้ม, เทา = จบแล้ว

`console` ของ log ยังเป็นพื้นเข้มบนหน้าสว่าง (คลาส `.console-surface`) — ตั้งใจไว้แบบนั้น
log อ่านง่ายกว่ากันมาก และเป็นธรรมเนียมของ SaaS โทนสว่างทั่วไป

## พอยท์ กับ หัวใจ ไม่ใช่ตัวเดียวกัน

ถึงอัตราจะ 1:1 แต่คนละความหมาย และโค้ดแยกกันคนละฟังก์ชัน:

- `formatPoints()` — ยอดในกระเป๋า ราคาแพ็ก ยอดที่หัก/คืน (`profile.points`, `pkg.points`, `job.points_spent`)
- `formatHearts()` — หัวใจในเกมที่ worker เก็บมาได้จริง (`job.hearts_collected`, `job.target_hearts`)
- `formatNumber()` — จำนวนนับทั่วไป (เพื่อน คำขอ รายการ)

ถ้าวันหนึ่งอัตราไม่ใช่ 1:1 แล้ว จุดที่ต้องแก้คือ `points_spent` ตอนสร้างงาน ไม่ใช่ทั้งแอป

## รัน

```bash
cd frontend-v2
cp .env.example .env.local     # ใส่ NEXT_PUBLIC_SUPABASE_* และ NEXT_PUBLIC_API_URL
npm install
npm run dev
```

เปิด http://localhost:3000

> **อย่ารัน backend ที่เครื่องคู่ไปด้วย** — มันจะแย่งคิว jobs เดียวกันกับ production
> ดูหัวข้อ "Dev workflow" ใน README ที่ root

## Deploy

Vercel → **Root Directory = `frontend-v2`** (preset Next.js ตรวจเอง)
ตัวแปรเหมือน v1 ทุกตัว:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_API_URL=https://<railway-domain>
NEXT_PUBLIC_WS_URL=wss://<railway-domain>
```

v1 กับ v2 ชี้ backend ตัวเดียวกันได้พร้อมกัน เปิดทิ้งไว้คู่กันระหว่างย้ายได้เลย
