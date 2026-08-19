# Autoheart

Web app สำหรับขายบริการฟาร์มหัวใจ Cookie Run อัตโนมัติ  
ชำระผ่านซองอั่งเปา TrueMoney → กรอก DevPlay credentials → รัน `heart_farm.py` บน worker พร้อม Fair Queue + Real-time logs

ดูรายละเอียดสเปกเต็มใน [`ARCHITECTURE.md`](./ARCHITECTURE.md)

Repo: https://github.com/Wipsr/Autoheart — branch `main`  
Deploy: frontend → **Vercel**, backend → **Railway** (ดู [Deploy](#deploy) ท้ายไฟล์)

## โครงสร้าง

```
Autoheart/
├── frontend/          # Next.js 14 (App Router) + Tailwind + Framer Motion
├── backend/           # FastAPI + job runner + heart_farm worker
├── supabase/          # SQL migrations + seed
└── ARCHITECTURE.md
```

## Auth (Nickname / Password)

ระบบไม่ใช้ email ใน UI — สมัคร/ล็อกอินด้วย **ชื่อผู้ใช้ + รหัสผ่าน**  
เบื้องหลัง map เป็น `{nickname}@autoheart.com` สำหรับ Supabase Auth

Admin เริ่มต้น: `Evasi0m` (role = admin อัตโนมัติ)


Project: `https://qcfvijgruitljvjrbguh.supabase.co`

รัน SQL ตามลำดับใน `supabase/migrations/` แล้วตามด้วย `supabase/seed.sql`  
(ใน SQL Editor หรือผ่าน Supabase MCP / CLI)

หลังสมัคร user แรก ตั้งแอดมิน:

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
```

ค่าที่ต้องใส่ใน Dashboard → Project Settings → API:

- `SUPABASE_URL`
- `anon` / `service_role` keys
- JWT Secret

## 2) Backend (local)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# สร้าง .env.local ที่ root หรือใน backend (ดู .env.example)
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export SUPABASE_JWT_SECRET=...
export TRUEWALLET_PHONE=0xxxxxxxxx
export CREDENTIALS_ENCRYPTION_KEY=long-random-secret

uvicorn main:app --reload --port 8000
```

Endpoints สำคัญ:

- `GET /api/packages`
- `POST /api/topup/redeem`
- `POST /api/credentials/verify`
- `POST /api/jobs/create` (single + batch)
- `GET /api/queue/status`
- `WS /ws/jobs/{id}?token=...`
- `/api/admin/*`

Worker loop จะดึง job จากคิวทีละ 1 งาน แล้วรัน:

`python heart_farm/heart_farm.py --api-mode --email ... --password ... --target-hearts N`

### Worker Reliability & Telegram alerts

ตั้งค่า `TELEGRAM_BOT_TOKEN` และ `TELEGRAM_CHAT_ID` ใน `.env.local` เพื่อรับการแจ้งเตือน job ล้มเหลว/งานค้าง. Worker จะ retry เฉพาะความผิดพลาดชั่วคราวได้สูงสุด 3 attempts โดยใช้ exponential backoff และ watchdog จะกู้คืน job ที่ไม่มี heartbeat ตาม timeout ที่กำหนดไว้ใน `.env.example` หรือ Admin → Worker Health.

สำหรับ production ให้รัน Uvicorn โดยไม่ใช้ `--reload`, เก็บ logs ของ container แบบ persistent และตรวจ endpoint `GET /health` ผ่าน health check ของ platform.

## 3) Frontend

```bash
cd frontend
cp .env.example .env.local
# ใส่ NEXT_PUBLIC_SUPABASE_* และ NEXT_PUBLIC_API_URL

npm install
npm run dev
```

เปิด http://localhost:3000

## โฟลว์ผู้ใช้

1. สมัคร / ล็อกอิน (Supabase Auth)
2. เลือกแพ็คเกจ × N → วางลิงก์ซองอั่งเปา → ได้ credits (หัวใจ)
3. กรอก DevPlay 1 ไอดีหรือหลายไอดี (batch)
4. ระบบ verify credentials → สร้าง jobs → Fair Interleaved Queue
5. ดูตำแหน่งคิว / เวลารอ dynamic / live console บน `/queue`

## หมายเหตุความปลอดภัย

- อย่า commit `.env.local` / service role key
- DevPlay password ถูกเข้ารหัส AES-GCM เก็บใน DB จนแอดมินลบ
- แนะนำใช้ MCP / backend กับโปรเจกต์ non-production ก่อน
- Anon key เป็น public ได้ แต่ service role ใช้ได้เฉพาะ backend

## Tailwind

Scaffold ใช้ Tailwind CSS v3.4 (Next.js 14 template) พร้อมธีม Premium Dark / glassmorphism ตามสเปก UI ใน ARCHITECTURE

## Deploy

Repo: https://github.com/Wipsr/Autoheart (branch `main`)

### Frontend → Vercel

Import repo → **Root Directory = `frontend`** (preset Next.js ตรวจเอง)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_API_URL=https://<railway-domain>
NEXT_PUBLIC_WS_URL=wss://<railway-domain>
```

### Backend → Railway

Deploy from GitHub → **Root Directory = `backend`** (เจอ `Dockerfile` เอง)

- **Health Check Path** = `/health`
- **Replicas = 1 เท่านั้น** — `job_runner_service` เป็น singleton ที่ดึงคิวทีละ 1 งาน
  ถ้า scale เกิน 1 จะมี worker แย่งคิวเดียวกัน job รันซ้อน
- ปิด **App Sleeping** — worker loop ต้องตื่นตลอด
- `Dockerfile` ผูก uvicorn กับ `$PORT` ที่ Railway inject ให้แล้ว

```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET
CREDENTIALS_ENCRYPTION_KEY     # ต้องเป็นค่าเดิม ไม่งั้นถอดรหัส DevPlay password เดิมไม่ออก
TRUEWALLET_PHONE
CORS_ORIGINS=https://<vercel-domain>
ENVIRONMENT=production
PYTHON_BIN=python3
TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
```

> **Egress IP**: Railway ใช้ IP ของ datacenter ซึ่ง DevPlay อาจบล็อก
> ถ้า login fail หลัง deploy ให้เปิด proxy ที่ Admin → Proxy ก่อน (`proxy_config` ใน DB)
