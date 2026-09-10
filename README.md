# Autoheart

Web app สำหรับขายบริการฟาร์มหัวใจ Cookie Run อัตโนมัติ  
ชำระผ่านซองอั่งเปา TrueMoney → กรอก DevPlay credentials → รัน `heart_farm.py` บน worker พร้อม Fair Queue + Real-time logs

ดูรายละเอียดสเปกเต็มใน [`ARCHITECTURE.md`](./ARCHITECTURE.md)

Repo: https://github.com/Wipsr/Autoheart — branch `main`  
Deploy: frontend → **Vercel**, backend → **Railway** (ดู [Deploy](#deploy) ท้ายไฟล์)

## โครงสร้าง

```
Autoheart/
├── frontend/          # Next.js 14 (App Router) — ธีมเดิม ดำ + ชมพู
├── frontend-v2/       # Next.js 14 — ธีมใหม่ โทนสว่าง + ระบบพอยท์ (ดู frontend-v2/README.md)
├── backend/           # FastAPI + job runner + heart_farm worker
├── supabase/          # SQL migrations + seed
└── ARCHITECTURE.md
```

ทั้งสอง frontend ใช้ backend ตัวเดียวกัน เปิดคู่กันระหว่างย้ายได้

## พอยท์ (Point)

สกุลเงินของระบบเรียกว่า **พอยท์** ไม่ใช่ "เครดิตหัวใจ" แล้ว — migration `015_points_currency.sql`
เปลี่ยนชื่อคอลัมน์และ RPC ให้ตรงกัน:

| เดิม | ใหม่ |
|---|---|
| `profiles.credits` | `profiles.points` |
| `packages.hearts` | `packages.points` |
| `topup_redemptions.hearts_credited` | `topup_redemptions.points_credited` |
| `promotions.hearts_reward` | `promotions.points_reward` |
| `jobs.credits_refunded` | `jobs.points_refunded` |
| — | `jobs.points_spent` (คอลัมน์ใหม่) |
| `credit_user_hearts()` / `deduct_user_hearts()` | `credit_user_points()` / `deduct_user_points()` |

**ที่ไม่เปลี่ยน:** `jobs.target_hearts`, `jobs.hearts_collected`, `hearts_per_minute`
คือหัวใจในเกมที่ worker ไปเก็บมาจริง ไม่ใช่ยอดเงินในบัญชี

อัตราตอนนี้ 1 พอยท์ = 1 หัวใจ แต่ `jobs.points_spent` เก็บยอดที่หักจริงไว้กับงาน
ถ้าวันหนึ่งเปลี่ยนอัตรา ตรรกะการคืนพอยท์ไม่ต้องแก้

ชื่อฟังก์ชันเดิม (`credit_user_hearts` / `deduct_user_hearts`) ยังอยู่เป็น wrapper ชี้ไปตัวใหม่
กัน backend รุ่นเก่าพังระหว่าง deploy — ลบทิ้งได้เมื่อ Railway รันโค้ดใหม่ครบแล้ว

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

## Dev workflow — อย่ารัน backend ที่เครื่อง

> **กฎ:** ตอน dev รันแค่ `frontend` แล้วชี้ `NEXT_PUBLIC_API_URL` ไป backend บน Railway

`job_runner_service` บังคับ "ทีละ 1 job" ในระดับ **process เดียว** ไม่ใช่ระดับระบบ
ถ้า backend ที่เครื่องกับบน Railway ชี้ Supabase project เดียวกัน ทั้งคู่จะ poll
ตาราง `jobs` เดียวกัน แล้วหยิบงานเดียวกันพร้อมกัน

เคยเกิดจริง — worker สองตัวหยิบ job เดียวกันห่างกัน 233ms ตัวที่เครื่อง dev ตายแล้ว
สั่ง fail งานที่ Railway กำลังฟาร์มสำเร็จอยู่ (เก็บไปแล้ว 587 หัวใจ) ครบ 3 ครั้ง
ระบบเลย refund ทิ้ง เสียหาย 5 job รวด

ถ้าจำเป็นต้องแก้ backend จริง ๆ ให้เลือกอย่างใดอย่างหนึ่ง:

- แยก Supabase project สำหรับ dev (ทางที่ถูก) แล้วชี้ `SUPABASE_URL` ไปโปรเจกต์นั้น
- หรือหยุด service `backend` บน Railway ก่อน แล้วค่อยเปิดกลับตอนเลิก (เสี่ยงลืม)

การเรียก API บน Railway จาก `localhost:3000` ต้องเพิ่ม `http://localhost:3000`
เข้าไปใน `CORS_ORIGINS` ที่ Railway ด้วย

## โฟลว์ผู้ใช้

1. สมัคร / ล็อกอิน (Supabase Auth)
2. เลือกแพ็คเกจ × N → วางลิงก์ซองอั่งเปา → ได้พอยท์
3. กรอก DevPlay 1 ไอดีหรือหลายไอดี (batch)
4. ระบบ verify credentials → สร้าง jobs → Fair Interleaved Queue
5. ดูตำแหน่งคิว / เวลารอ dynamic / live console บน `/queue`

## เครื่องมือฟรี (proxy ไป ngmx)

นอกจากฟาร์มหัวใจที่เข้าคิว worker ของเราเอง ยังมีเครื่องมือที่ใช้ฟรี ไม่ตัดพอยท์
และไม่เข้าคิว เพราะงานรันอยู่ฝั่ง ngmx:

| หน้า | เครื่องมือ | ทำอะไร |
|---|---|---|
| `/account` | เช็คข้อมูลไอดี | อ่าน wallet/ของในคลัง |
| `/powder` | ปั๊มผงเวทมนตร์ | เปิดกล่องสุ่มด้วยเหรียญในบัญชีแลกผง |
| `/giftbox` | เปิดกล่องของขวัญ | เปิดกล่องที่ค้างอยู่ในบัญชีรวดเดียว |
| `/treasure` | ตี + สมบัติ | อัปเกรด + ให้สมบัติในกระเป๋า |

สามตัวหลังมี 2 จังหวะ: `POST /api/tools/{slug}/scan` (ล็อกอินดูยอดปัจจุบัน) แล้ว
`WS /ws/tools/{slug}` (สั่งงาน + ถ่ายทอด log สด) — ปิดหน้าเว็บ = backend สั่งยกเลิก
งานให้ ดู `backend/services/ngmx_service.py` และ `backend/api/routes/tools.py`

## หมายเหตุความปลอดภัย

- อย่า commit `.env.local` / service role key
- DevPlay password ถูกเข้ารหัส AES-GCM เก็บใน DB จนแอดมินลบ
- แนะนำใช้ MCP / backend กับโปรเจกต์ non-production ก่อน
- Anon key เป็น public ได้ แต่ service role ใช้ได้เฉพาะ backend
- เครื่องมือที่ proxy ไป ngmx ส่งรหัส DevPlay ของผู้ใช้วิ่งผ่านเซิร์ฟเวอร์บุคคลที่สาม
  (ต้นทุนที่ยอมรับไว้แล้วเพื่อไม่ต้องแตก content bundle เอง) — อย่า log และอย่าเก็บลง DB

## Tailwind

Scaffold ใช้ Tailwind CSS v3.4 (Next.js 14 template) พร้อมธีม Premium Dark / glassmorphism ตามสเปก UI ใน ARCHITECTURE

## Deploy

Repo: https://github.com/Wipsr/Autoheart (branch `main`)

### Frontend → Vercel

repo นี้มี frontend สองตัว แต่ละตัวเป็น Vercel project แยกกัน ต่างกันแค่ Root Directory:

| Vercel project | Root Directory | โดเมน |
|---|---|---|
| `autoheart` | `frontend` | autoheart.vercel.app |
| `autoheart-v2` | `frontend-v2` | autoheart-v2.vercel.app |

ทั้งคู่ใช้ตัวแปรชุดเดียวกันและชี้ backend ตัวเดียวกันได้พร้อมกัน:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_API_URL=https://<railway-domain>
NEXT_PUBLIC_WS_URL=wss://<railway-domain>
```

> **ทุกโดเมนที่เพิ่มใหม่ต้องไปใส่ใน `CORS_ORIGINS` ที่ Railway ด้วย**
> ไม่งั้นหน้าเว็บโหลดขึ้นปกติแต่ยิง API ไม่ได้เลยสักเส้น เบราว์เซอร์บล็อกที่ preflight
> เช็คได้ด้วย:
> ```bash
> curl -i -X OPTIONS https://<railway-domain>/api/packages \
>   -H 'Origin: https://<vercel-domain>' \
>   -H 'Access-Control-Request-Method: GET' | grep -i access-control-allow-origin
> ```
> ถ้าไม่มีบรรทัด `access-control-allow-origin` กลับมา = ยังไม่ผ่าน

> การแก้ Environment Variables บน Vercel **ไม่ trigger deploy ให้เอง**
> ต้องกด Redeploy หรือ push commit เข้า `main` อีกที ค่าใหม่ถึงจะเข้า build

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
