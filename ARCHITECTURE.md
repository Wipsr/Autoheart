# Autoheart — โครงสร้างโปรเจกต์แบบละเอียด (สำหรับ Claude Code)

> **เป้าหมาย**: สร้าง Web App สำหรับขายบริการฟาร์มหัวใจ Cookie Run อัตโนมัติ โดยลูกค้าซื้อแพ็คเกจ → ชำระเงินผ่านซองอั่งเปา TrueMoney → กรอก DevPlay credentials → ระบบรัน Python script บน worker ให้อัตโนมัติ พร้อมระบบคิวที่ไม่ให้ job ซ้อนกัน

---

## สารบัญ

1. [Tech Stack](#1-tech-stack)
2. [โครงสร้างโฟลเดอร์](#2-โครงสร้างโฟลเดอร์)
3. [ระบบ User & Auth (Supabase)](#3-ระบบ-user--auth-supabase)
4. [Database Schema (Supabase PostgreSQL)](#4-database-schema-supabase-postgresql)
5. [แพ็คเกจและราคา](#5-แพ็คเกจและราคา)
6. [ระบบชำระเงิน (TrueMoney Angpao)](#6-ระบบชำระเงิน-truemoney-angpao)
7. [Flow การซื้อ-ชำระ-รัน (User Journey & Batch Purchase)](#7-flow-การซื้อ-ชำระ-รัน-user-journey--batch-purchase)
8. [ระบบตรวจสอบ DevPlay Credentials](#8-ระบบตรวจสอบ-devplay-credentials)
9. [ระบบคิวงาน (Job Queue & Multi-Job Fairness)](#9-ระบบคิวงาน-job-queue--multi-job-fairness)
10. [Backend API (Python/FastAPI on Railway)](#10-backend-api-pythonfastapi-on-railway)
11. [Python Heart Farm Worker](#11-python-heart-farm-worker)
12. [ระบบ Proxy](#12-ระบบ-proxy)
13. [Admin Panel](#13-admin-panel)
14. [Frontend (Next.js)](#14-frontend-nextjs)
15. [Real-time & WebSocket](#15-real-time--websocket)
16. [Security & Rate Limiting](#16-security--rate-limiting)
17. [Deployment Strategy](#17-deployment-strategy)
18. [สิ่งที่แนะนำเพิ่มเติม](#18-สิ่งที่แนะนำเพิ่มเติม)
19. [Design Decisions (ยืนยันแล้ว)](#design-decisions-ยืนยันแล้ว)

---

## 1. Tech Stack

### Frontend
| เทคโนโลยี | ทำไมถึงเลือก |
|---|---|
| **Next.js 14+ (App Router)** | SSR/SSG, API routes, deploy Cloudflare Pages ง่าย |
| **TypeScript** | Type safety ลดบัก |
| **Tailwind CSS v4** | Responsive + premium UI ทำได้เร็ว |
| **Framer Motion** | Micro-animations, page transitions |
| **Supabase JS Client** | Auth + Realtime subscriptions |
| **Lucide React / Heroicons** | Icon set สวยงาม |
| **Google Fonts (Inter)** | Typography premium |

### Backend (Railway)
| เทคโนโลยี | ทำไมถึงเลือก |
|---|---|
| **Python 3.11+ / FastAPI** | Async, เร็ว, รองรับ WebSocket, ใกล้ชิดกับ heart_farm.py |
| **Uvicorn** | ASGI server สำหรับ FastAPI |
| **Supabase Python SDK** | เชื่อมกับ DB/Auth จาก backend |
| **asyncio + subprocess** | รัน heart_farm.py เป็น subprocess |
| **Redis** | Queue management + caching + rate limiting |

### Infrastructure
| ส่วน | เทคโนโลยี |
|---|---|
| **Database** | Supabase PostgreSQL |
| **Auth** | Supabase Auth (email/password) |
| **Realtime** | Supabase Realtime (DB changes) + WebSocket (job progress) |
| **Frontend Hosting** | Cloudflare Pages (ทดสอบบน GitHub Pages ก่อน) |
| **Backend Hosting** | Railway — container เดียว, **replicas = 1** (รัน FastAPI + heart_farm worker ในคอนเทนเนอร์เดียวกัน) |

---

## 2. โครงสร้างโฟลเดอร์

```
Autoheart/
├── frontend/                          # Next.js App
│   ├── public/
│   │   ├── favicon.ico
│   │   ├── og-image.png              # Social share image
│   │   └── assets/
│   │       └── heart-animation.json   # Lottie animation
│   ├── src/
│   │   ├── app/                       # Next.js App Router
│   │   │   ├── layout.tsx             # Root layout (fonts, meta, providers)
│   │   │   ├── page.tsx               # Landing / Home page
│   │   │   ├── globals.css            # Tailwind + custom CSS
│   │   │   │
│   │   │   ├── (auth)/                # Route group: Auth pages
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── register/page.tsx
│   │   │   │   └── forgot-password/page.tsx
│   │   │   │
│   │   │   ├── (dashboard)/           # Route group: ต้อง login
│   │   │   │   ├── layout.tsx         # Dashboard layout (sidebar, navbar)
│   │   │   │   ├── dashboard/page.tsx # หน้าหลักหลัง login
│   │   │   │   ├── packages/page.tsx  # เลือกแพ็คเกจ
│   │   │   │   ├── purchase/[id]/page.tsx  # ขั้นตอนซื้อ (payment + credentials)
│   │   │   │   ├── queue/page.tsx     # สถานะคิว real-time
│   │   │   │   ├── history/page.tsx   # ประวัติการใช้งาน
│   │   │   │   ├── friend-requests/page.tsx  # รับ/ปฏิเสธคำขอเป็นเพื่อน (ฟรี ไม่ผ่านคิว)
│   │   │   │   ├── friends/page.tsx   # ลบเพื่อนในเกม (ฟรี ไม่ผ่านคิว)
│   │   │   │   ├── invite/page.tsx    # เชิญเพื่อน 29 คน (ฟรี ไม่ผ่านคิว)
│   │   │   │   └── settings/page.tsx  # ตั้งค่าบัญชี (เปลี่ยนรหัสผ่าน)
│   │   │   │
│   │   │   └── (admin)/               # Route group: Admin only
│   │   │       ├── layout.tsx         # Admin layout + auth guard
│   │   │       ├── admin/page.tsx     # Admin dashboard (overview)
│   │   │       ├── admin/users/page.tsx       # จัดการ users
│   │   │       ├── admin/users/[id]/page.tsx  # User detail + job history
│   │   │       ├── admin/jobs/page.tsx        # จัดการ jobs ทั้งหมด
│   │   │       ├── admin/jobs/[id]/page.tsx   # Job detail + log
│   │   │       ├── admin/topups/page.tsx      # ประวัติเติมเงินทั้งหมด
│   │   │       ├── admin/proxy/page.tsx       # ตั้งค่า Proxy
│   │   │       └── admin/settings/page.tsx    # ตั้งค่าระบบ
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                    # Reusable UI components
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Badge.tsx
│   │   │   │   ├── Toast.tsx
│   │   │   │   ├── Skeleton.tsx
│   │   │   │   ├── ProgressBar.tsx
│   │   │   │   └── StatusIndicator.tsx
│   │   │   │
│   │   │   ├── layout/
│   │   │   │   ├── Navbar.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Footer.tsx
│   │   │   │   └── MobileNav.tsx
│   │   │   │
│   │   │   ├── auth/
│   │   │   │   ├── LoginForm.tsx
│   │   │   │   ├── RegisterForm.tsx
│   │   │   │   └── AuthGuard.tsx
│   │   │   │
│   │   │   ├── packages/
│   │   │   │   ├── PackageCard.tsx       # การ์ดแพ็คเกจ (มี glow effect)
│   │   │   │   └── PackageGrid.tsx
│   │   │   │
│   │   │   ├── purchase/
│   │   │   │   ├── PaymentStep.tsx       # ขั้นตอน TrueMoney angpao
│   │   │   │   ├── CredentialsStep.tsx   # กรอก DevPlay email/password
│   │   │   │   ├── ConfirmStep.tsx       # ยืนยันรันฟาร์ม
│   │   │   │   └── PurchaseWizard.tsx    # Multi-step wizard container
│   │   │   │
│   │   │   ├── queue/
│   │   │   │   ├── QueueStatus.tsx       # แสดงตำแหน่งคิว + เวลารอ
│   │   │   │   ├── QueueList.tsx         # รายการคิวทั้งหมด
│   │   │   │   ├── JobProgress.tsx       # Progress bar + log stream
│   │   │   │   └── QueuePositionBadge.tsx
│   │   │   │
│   │   │   └── admin/
│   │   │       ├── UserTable.tsx
│   │   │       ├── JobTable.tsx
│   │   │       ├── TopupTable.tsx
│   │   │       ├── ProxySettings.tsx
│   │   │       ├── StatsCards.tsx
│   │   │       └── JobLogViewer.tsx
│   │   │
│   │   ├── lib/
│   │   │   ├── supabase/
│   │   │   │   ├── client.ts          # Browser Supabase client
│   │   │   │   ├── server.ts          # Server-side Supabase client
│   │   │   │   └── middleware.ts      # Auth middleware
│   │   │   ├── api.ts                 # API helper (fetch wrapper ไปหา backend)
│   │   │   ├── constants.ts           # แพ็คเกจ, สถานะ, etc.
│   │   │   └── utils.ts              # Helper functions
│   │   │
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useQueue.ts            # Real-time queue subscription
│   │   │   ├── useJobStatus.ts        # Real-time job status
│   │   │   └── useAdmin.ts
│   │   │
│   │   └── types/
│   │       ├── database.ts            # Supabase generated types
│   │       ├── api.ts                 # API request/response types
│   │       └── index.ts
│   │
│   ├── middleware.ts                   # Next.js middleware (auth redirect)
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                            # Python FastAPI (runs on Railway)
│   ├── main.py                         # FastAPI app entry point
│   ├── config.py                       # Environment config
│   ├── requirements.txt
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py                # Verify Supabase JWT
│   │   │   ├── packages.py            # GET /api/packages
│   │   │   ├── topup.py               # POST /api/topup/redeem, GET /api/topup/history
│   │   │   ├── jobs.py                # POST /api/jobs/create, GET /api/jobs/status
│   │   │   ├── queue.py               # GET /api/queue/status, GET /api/queue/position
│   │   │   ├── credentials.py         # POST /api/credentials/verify (DevPlay login check)
│   │   │   ├── friends.py             # POST /api/friends/list|accept|reject|delete (ฟรี)
│   │   │   ├── invite.py              # POST /api/invite/status|run (เชิญเพื่อน — ฟรี)
│   │   │   ├── admin.py               # Admin-only routes
│   │   │   └── websocket.py           # WebSocket endpoints for real-time
│   │   │
│   │   ├── middleware/
│   │   │   ├── __init__.py
│   │   │   ├── auth_middleware.py      # JWT verification
│   │   │   ├── admin_middleware.py     # Admin role check
│   │   │   └── rate_limiter.py        # Rate limiting
│   │   │
│   │   └── dependencies.py            # FastAPI dependencies (get_current_user, etc.)
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── truemoney_service.py        # TrueMoney angpao redeem logic
│   │   ├── devplay_auth_service.py     # DevPlay credential verification
│   │   ├── queue_service.py            # Job queue manager (Fair Interleaving / FIFO)
│   │   ├── job_runner_service.py       # Subprocess manager for heart_farm.py
│   │   ├── friend_service.py           # Subprocess manager for friend_tool.py
│   │   ├── invite_service.py           # Subprocess manager for invite_tool.py
│   │   ├── proxy_service.py            # Proxy config read/write
│   │   ├── notification_service.py     # WebSocket broadcast + Supabase realtime
│   │   └── admin_service.py            # Admin data queries
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── job.py                      # Job model/enum
│   │   ├── package.py                  # Package model
│   │   ├── topup.py                    # Topup model
│   │   └── queue.py                    # Queue item model
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── supabase_client.py          # Supabase admin client
│   │   ├── security.py                 # JWT decode, password hash
│   │   └── exceptions.py              # Custom exceptions
│   │
│   ├── workers/
│   │   ├── __init__.py
│   │   └── heart_farm_worker.py        # Wraps heart_farm.py execution
│   │
│   └── heart_farm/                     # Heart farm scripts (copied from heart_farm_share)
│       ├── heart_farm.py               # Main farm script (modified for API mode)
│       ├── heart_farm_fast.py          # Fast variant
│       ├── friend_tool.py              # list/accept/reject/remove friends (เมนูจัดการเพื่อนบนเว็บ)
│       ├── _descriptors.bin            # Game protocol definitions
│       └── requirements.txt
│
├── supabase/                           # Supabase configuration
│   ├── migrations/
│   │   ├── 001_create_profiles.sql
│   │   ├── 002_create_packages.sql
│   │   ├── 003_create_topup_redemptions.sql
│   │   ├── 004_create_jobs.sql
│   │   ├── 005_create_job_logs.sql
│   │   ├── 006_create_queue.sql
│   │   ├── 007_create_proxy_config.sql
│   │   └── 008_create_rls_policies.sql
│   │
│   └── seed.sql                        # Seed data (packages, admin user)
│
├── .env.example                        # Environment template
├── .env.local                          # Local dev env (gitignored)
├── .gitignore
├── docker-compose.yml                  # Optional: local dev
└── README.md
```

---

## 3. ระบบ User & Auth (Supabase)

### 3.1 การสมัคร (Register)

```
Flow:
1. User กรอก email + password ที่หน้า /register
2. Frontend เรียก supabase.auth.signUp({ email, password })
3. Supabase ส่ง confirmation email (หรือ auto-confirm ถ้าตั้งค่าไว้)
4. เมื่อ confirm → trigger function สร้าง row ใน profiles table
5. Redirect ไปหน้า /dashboard
```

### 3.2 การ Login

```
Flow:
1. User กรอก email + password ที่หน้า /login
2. Frontend เรียก supabase.auth.signInWithPassword({ email, password })
3. ได้ JWT access_token + refresh_token
4. เก็บ session ไว้ใน cookies (httpOnly)
5. ทุก API call ไป backend → แนบ JWT ใน Authorization header
6. Backend verify JWT ด้วย Supabase public key
```

### 3.3 เปลี่ยนรหัสผ่าน

```
Flow:
1. User ไปหน้า /settings
2. กรอก password เก่า + password ใหม่
3. Frontend เรียก supabase.auth.updateUser({ password: newPassword })
4. แสดง toast success / error
```

### 3.4 Role Management

```
- Default role: "user"
- Admin role: ตั้งค่าใน profiles.role = 'admin' (ตั้งค่าจาก Supabase Dashboard SQL Editor)
- Admin ถูกเช็คที่ทั้ง Frontend (route guard) และ Backend (middleware)
```

---

## 4. Database Schema (Supabase PostgreSQL)

### 4.1 `profiles` — ข้อมูลผู้ใช้เพิ่มเติม

```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    credits INTEGER NOT NULL DEFAULT 0,         -- จำนวนหัวใจคงเหลือ (สะสม)
    total_spent_baht NUMERIC(10,2) DEFAULT 0,   -- ยอดเงินใช้ไปทั้งหมด
    total_jobs INTEGER DEFAULT 0,                -- จำนวน job ทั้งหมด
    is_banned BOOLEAN DEFAULT FALSE,
    banned_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: auto-create profile on auth.users insert
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

### 4.2 `packages` — แพ็คเกจที่ขาย

```sql
CREATE TABLE packages (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,                  -- "แพ็คเกจ 1,000 หัวใจ"
    slug TEXT UNIQUE NOT NULL,           -- "1000-hearts"
    hearts INTEGER NOT NULL,             -- 1000, 2000, 3000
    price_baht NUMERIC(10,2) NOT NULL,   -- 40, 69, 99
    description TEXT,
    badge TEXT,                           -- "ยอดนิยม", "คุ้มสุด", null
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data
INSERT INTO packages (name, slug, hearts, price_baht, description, badge, sort_order) VALUES
    ('แพ็คเกจ 1,000 หัวใจ', '1000-hearts', 1000, 40.00, 'เหมาะสำหรับเริ่มต้น', NULL, 1),
    ('แพ็คเกจ 2,000 หัวใจ', '2000-hearts', 2000, 69.00, 'คุ้มค่าที่สุด ประหยัดกว่า 14%', 'ยอดนิยม', 2),
    ('แพ็คเกจ 3,000 หัวใจ', '3000-hearts', 3000, 99.00, 'สำหรับสายฟาร์มจริงจัง ประหยัดกว่า 18%', 'คุ้มสุด', 3);
```

### 4.3 `topup_redemptions` — ประวัติการเติมเงิน (TrueMoney)

```sql
CREATE TABLE topup_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    package_id INTEGER NOT NULL REFERENCES packages(id),
    
    -- TrueMoney angpao data
    voucher_url TEXT NOT NULL,           -- URL ซองอั่งเปา ที่ลูกค้ากรอก
    voucher_id TEXT UNIQUE,              -- ID จาก TrueMoney API (dedup)
    amount_baht NUMERIC(10,2),           -- จำนวนเงินที่ได้จาก voucher
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'credited', 'failed', 'needs_manual', 'refunded')),
    credit_status TEXT DEFAULT 'pending'
        CHECK (credit_status IN ('pending', 'credited', 'needs_manual')),
    hearts_credited INTEGER DEFAULT 0,
    
    -- Error handling
    error_code TEXT,
    error_message TEXT,
    error_note TEXT,                      -- Internal note (admin visible)
    tmn_raw_response JSONB,              -- Raw TrueMoney API response (for debugging)
    
    -- Admin actions
    admin_credited_by UUID REFERENCES profiles(id),
    admin_credited_at TIMESTAMPTZ,
    admin_note TEXT,
    
    -- Metadata
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_topup_user ON topup_redemptions(user_id);
CREATE INDEX idx_topup_status ON topup_redemptions(status);
CREATE INDEX idx_topup_voucher ON topup_redemptions(voucher_id);
```

### 4.4 `jobs` — งานฟาร์มหัวใจ

```sql
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    topup_id UUID REFERENCES topup_redemptions(id),
    package_id INTEGER REFERENCES packages(id),
    
    -- DevPlay credentials (encrypted at rest)
    devplay_email TEXT NOT NULL,
    devplay_password_encrypted TEXT NOT NULL,   -- AES-256 encrypted (เก็บจนกว่า admin จะลบ)
    
    -- Job config
    target_hearts INTEGER NOT NULL,             -- จำนวนหัวใจที่ต้องการ
    
    -- Queue position
    queue_position INTEGER,                     -- ตำแหน่งคิวปัจจุบัน (null = ไม่อยู่ในคิว)
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN (
            'queued',           -- อยู่ในคิว รอดำเนินการ
            'validating',       -- กำลังตรวจสอบ credentials
            'validation_failed',-- Credentials ผิด
            'processing',       -- กำลังรันฟาร์ม
            'completed',        -- เสร็จสมบูรณ์
            'failed',           -- ล้มเหลว
            'cancelled',        -- ยกเลิกโดย user/admin
            'refunded'          -- คืนเงินแล้ว
        )),
    
    -- Progress (real-time update)
    hearts_collected INTEGER DEFAULT 0,        -- หัวใจที่เก็บได้แล้ว
    current_session INTEGER DEFAULT 0,          -- session ปัจจุบัน
    total_sessions INTEGER DEFAULT 0,           -- session ทั้งหมดที่ต้องใช้
    progress_percent NUMERIC(5,2) DEFAULT 0,    -- % ความคืบหน้า
    progress_message TEXT,                       -- ข้อความสถานะปัจจุบัน
    
    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    estimated_duration_minutes INTEGER,         -- เวลาประมาณ
    actual_duration_seconds INTEGER,
    
    -- Error info
    error_message TEXT,
    error_detail JSONB,
    retry_count INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_user ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_queue ON jobs(queue_position) WHERE status = 'queued';
CREATE INDEX idx_jobs_created ON jobs(created_at DESC);
```

### 4.5 `job_logs` — Log รายละเอียดการทำงานของ job

```sql
CREATE TABLE job_logs (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    
    level TEXT NOT NULL DEFAULT 'info'
        CHECK (level IN ('debug', 'info', 'warning', 'error', 'critical')),
    
    message TEXT NOT NULL,
    data JSONB,
    source TEXT DEFAULT 'worker',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_logs_job ON job_logs(job_id);
CREATE INDEX idx_job_logs_level ON job_logs(level) WHERE level IN ('error', 'critical');
```

---

## 5. แพ็คเกจและราคา

| แพ็คเกจ | ราคา (บาท) | จำนวนหัวใจ | ราคา/หัวใจ | badge |
|---|---|---|---|---|
| เริ่มต้น | 40 | 1,000 | 0.040 | — |
| ยอดนิยม | 69 | 2,000 | 0.035 | ⭐ ยอดนิยม |
| คุ้มสุด | 99 | 3,000 | 0.033 | 🔥 คุ้มสุด |

---

## 6. ระบบชำระเงิน (TrueMoney Angpao)

### 6.1 Flow การชำระเงิน

```
1. ลูกค้าเลือกแพ็คเกจ + จำนวน (เช่น 69 บาท x 5 = 345 บาท)
2. สร้างซองอั่งเปา TrueMoney Wallet จำนวน 345 บาท และกรอก URL
3. Backend redeem voucher ด้วย TRUEWALLET_PHONE (หรือเบอร์ที่ Admin override ไว้ใน system_settings)
4. เมื่อสำเร็จ → เพิ่ม Credits/Tokens ในบัญชีผู้ใช้
```

---

## 7. Flow การซื้อ-ชำระ-รัน (User Journey & Batch Purchase)

### 7.1 ระบบ Token / Credit Balance & Multi-Package Purchase

เพื่อรองรับความต้องการที่ **ลูกค้า 1 คน สามารถซื้อหลายแพ็คเกจพร้อมกันได้ (เช่น ซื้อ 10 แพ็ค)** และต้องการนำไปรันกับ **หลายไอดี DevPlay แยกกัน**:

1. **ซื้อแพ็คเกจ / เติมเงิน**:
   - ลูกค้าเลือกแพ็คเกจ + จำนวนที่ต้องการ (เช่น แพ็คเกจ 2,000 หัวใจ x 5 รายการ = 345 บาท)
   - สร้างซองอั่งเปา TrueMoney Wallet ยอดรวม 345 บาท และกรอก URL
   - เมื่อ Backend ตรวจสอบสำเร็จ จะโอนเข้าเป็น **Tokens / Credits** ในบัญชีผู้ใช้ (เช่น มี `2,000 Hearts Token` จำนวน 5 โทเคน)

2. **การสั่งรันงาน (Job Creation)**:
   - **โหมดเดี่ยว (Single Account)**: เลือกใช้ 1 Token → กรอก Email/Password ของ 1 ไอดี → ตรวจสอบ Credentials → เข้าคิว 1 Job
   - **โหมดกลุ่ม/หลายไอดี (Batch Accounts)**: 
     - ลูกค้าเลือกจำนวน Token ที่จะใช้ (เช่น 5 โทเคน)
     - ระบบเปิดหน้าฟอร์มให้กรอก DevPlay Credentials จำนวน 5 ชุด (หรือเลือกใช้ไอดีเดิมซ้ำได้)
     - ระบบจะตรวจสอบ (Validate) ทุกไอดีใน background
     - ไอดีที่ผ่านทั้งหมด จะถูกสร้างเป็น **5 Jobs แยกกัน** (Job #1 ถึง #5) และถูกส่งเข้าคิวประมวลผล

---

### 7.2 Flowchart ระบบจัดคิวและรันงาน (User & Queue Journey)

```mermaid
flowchart TD
    A[ลูกค้าเข้าเว็บ / Dashboard] --> B[เลือกซื้อแพ็คเกจ x N]
    B --> C["ชำระเงินซองอั่งเปา TrueMoney (ยอดรวม N แพ็ค)"]
    C --> D{Backend: Verify Voucher}
    D -->|ล้มเหลว| E[แจ้ง Error / ให้กรอกใหม่]
    E --> C
    D -->|สำเร็จ| F["ได้รับ Credits/Tokens ตามจำนวนแพ็ค"]
    
    F --> G{เลือกรูปแบบการสั่งรัน}
    G -->|รันทีละไอดี| H[กรอก DevPlay 1 ไอดี]
    G -->|รันหลายไอดีพร้อมกัน Batch| I["กรอก DevPlay N ไอดี (แยกฟอร์ม N ช่อง)"]
    
    H --> J[Verify DevPlay Credentials]
    I --> J
    
    J -->|มีไอดีที่รหัสผิด| K[แจ้งไอดีที่ผิด ให้แก้ไข]
    K --> J
    J -->|ตรวจสอบผ่านทั้งหมด| L["สร้าง Jobs (1 Job ต่อ 1 แพ็คเกจ)"]
    
    L --> M[ส่ง Jobs เข้าสู่ระบบคิว Queue Manager]
    M --> N[จัดลำดับคิว Fair Scheduling / FIFO]
    
    N --> O[หน้าจอ Queue Status แสดงตำแหน่ง & เวลารอ real-time]
    
    O --> P{ถึงคิว Job ใด Job หนึ่ง}
    P --> Q[เริ่มรัน heart_farm.py บน worker (รันทีละ 1 Job เท่านั้น)]
    Q --> R["แสดง Live Progress + Execution Log Stream"]
    R --> S{Job เสร็จสมบูรณ์?}
    S -->|ยัง| R
    S -->|เสร็จ| T[อัปเดตสถานะ Completed → เริ่ม Job ถัดไปในคิว]
```

---

## 8. ระบบตรวจสอบ DevPlay Credentials

### 8.1 Verification Flow

```python
# backend/services/devplay_auth_service.py

class DevPlayAuthService:
    AUTH_HOST = "https://account.devplay.com"
    APP_HEADERS = {
        "X-Bundle-Id": "com.devsisters.crg",
        "X-API-Key": "SrwOwqNLG7fyi0kYvk03xc1s7eM",
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "okhttp/5.3.2",
    }
    
    async def verify_credentials(self, email: str, password: str) -> dict:
        """
        ตรวจสอบว่า DevPlay email/password ถูกต้องก่อนส่งเข้าคิว
        """
        lc = self._fresh_lc()
        async with httpx.AsyncClient() as client:
            await client.post(f"{self.AUTH_HOST}/v4/checkemail", json={"email": email, "lc": lc}, headers=self.APP_HEADERS, timeout=20)
            response = await client.post(f"{self.AUTH_HOST}/v3/login/devsisters", json={"email": email, "password": password, "oven_access_token": "", "lc": lc}, headers=self.APP_HEADERS, timeout=20)
            data = response.json()
        
        if data.get("game_access_token"):
            return {"valid": True, "mid": data.get("member", {}).get("mid")}
        else:
            return {"valid": False, "error_message": "อีเมลหรือรหัสผ่าน DevPlay ไม่ถูกต้อง"}
```

---

## 9. ระบบคิวงาน (Job Queue & Multi-Job Fairness)

### 9.1 หลักการสำคัญ & การจัดการคิวหลายงาน

> **กฎเหล็ก**: worker รันได้ทีละ **1 Job เท่านั้น** (Railway replicas = 1) เพื่อไม่ให้ guest accounts ชนกันบนระบบเกม  
> **การบริหารคิวหลายจ็อบ (Multi-Job Scheduling)**:
> 1. ลูกค้าคนเดียวกันสั่งรัน N จ็อบพร้อมกัน → ทั้ง N จ็อบจะถูกสร้างเป็น Queue Items แยกตาม ID จ็อบ
> 2. **Fair Interleaved Queue Scheduling (คิวเป็นธรรม)**: ป้องกันไม่ให้ลูกค้าคนเดียวที่ส่ง 10 จ็อบ ยึดคิวทั้งหมดจนลูกค้าคนอื่นต้องรอนานเกินไป
>    - ระบบจะสลับคิวแบบ Round-Robin per User (เช่น User A Job1 → User B Job1 → User A Job2...)
>    - สามารถสลับกลับเป็น **Strict FIFO** ได้ผ่าน Admin Settings

---

### 9.2 Dynamic Wait Time Calculation & Real-Time Logging

```python
# backend/services/queue_service.py

class FairQueueService:
    async def _calculate_dynamic_wait_time(self, target_position: int) -> int:
        """
        คำนวณเวลารอโดยประมาณ (นาที) อย่างละเอียด:
        เวลารอ = (หัวใจที่เหลือของ Job ปัจจุบัน + รวมหัวใจของทุก Job ที่อยู่ก่อนหน้า) / ความเร็วเฉลี่ย (50 ดวง/นาที)
        """
        HEARTS_PER_MINUTE = 50.0
        total_remaining_hearts = 0
        
        active_job = await self.db.get_active_job()
        if active_job:
            total_remaining_hearts += max(0, active_job["target_hearts"] - active_job.get("hearts_collected", 0))
            
        jobs_ahead = await self.db.get_queued_jobs_up_to_position(target_position - 1)
        for j in jobs_ahead:
            total_remaining_hearts += j["target_hearts"]
            
        return int(total_remaining_hearts / HEARTS_PER_MINUTE) + 1
```

---

## 10. Admin Panel

- Overview Dashboard & Real-Time Stats
- User Management & Transaction Logs
- Job Queue Control (Pause, Cancel, Retry, Reorder)
- Topup Management (Needs Manual Credit Override)
- Proxy Settings (URL, Test Button, Enable/Disable)
- System Settings (TRUEWALLET_PHONE Override, Queue Strategy Toggle: Fair Interleaving / Strict FIFO)

---

## Design Decisions (ยืนยันแล้ว)

| # | คำถาม | คำตอบ (ยืนยัน) |
|---|---|---|
| 1 | **TrueMoney API** | ✅ ใช้ URL `https://gift.truemoney.com/campaign/vouchers/{hash}/redeem` ถูกต้อง — **ไม่มี API key เพิ่มเติม** |
| 2 | **เบอร์ TrueMoney ผู้รับ** | ✅ **ทั้งสองทาง** — ค่า default จาก `ENV (TRUEWALLET_PHONE)` แต่ admin สามารถ override ได้ผ่าน Admin Panel UI (เก็บใน `system_settings` table) |
| 3 | **DevPlay Password หลัง Job** | ✅ **เก็บไว้ตลอด** จนกว่า admin จะลบเอง — เพื่อให้ admin สามารถ retry job ได้เสมอ (ยอมรับความเสี่ยงที่สูงขึ้น) |
| 4 | **Frontend Framework** | ✅ **Next.js 14+ (App Router)** — SSR + deploy Cloudflare Pages ง่าย |
| 5 | **CSS Framework** | ✅ **Tailwind CSS v4** — ทำ responsive + premium UI ได้เร็ว |
| 6 | **Backend Hosting** | ✅ **Railway** — container เดียว, replicas = 1 (คิวเก็บใน Supabase; `REDIS_URL` มีใน config แต่โค้ดยังไม่ได้ใช้จริง) |
| 7 | **Admin User คนแรก** | ✅ สร้างจาก **Supabase Dashboard** โดยตรง (สมัคร user ปกติ → แก้ `profiles.role = 'admin'` ใน SQL Editor) |
