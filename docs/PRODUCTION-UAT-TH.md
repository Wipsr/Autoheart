# Production UAT

ใช้หลัง deploy หรือก่อนเปิดรับลูกค้าจริง  
Web: `https://<vercel-domain>` · API: `https://<railway-domain>`

แทนค่า `<vercel-domain>` / `<railway-domain>` ด้วยโดเมนจริงของ deployment ก่อนรัน

บันทึกผล: ใส่ `[x]` / `[ ]` และวันที่ทดสอบ

---

## 0. Smoke อัตโนมัติ (เครื่องใดก็ได้)

```bash
API=https://<railway-domain>
WEB=https://<vercel-domain>

curl -sS "$API/health"
curl -sS -o /dev/null -w "%{http_code}\n" "$WEB/"
curl -sS "$API/api/packages" | head -c 200
```

ผ่านเมื่อ: health `ok: true`, เว็บ `200`, packages เป็น JSON array

---

## 1. Supabase Auth (Dashboard — ครั้งเดียว)

- [ ] **Authentication → URL Configuration**  
  - Site URL: `https://<vercel-domain>`  
  - Redirect URLs: `https://<vercel-domain>/**` (+ custom domain ถ้ามี)
- [ ] **Providers → Email** → ปิด **Confirm email**

---

## 2. บัญชีผู้ใช้

| # | ขั้นตอน | ผ่าน |
|---|---------|------|
| 2.1 | สมัคร nickname ใหม่ (รหัสผ่าน + ยืนยันรหัสผ่านตรงกัน) → เข้า dashboard | [ ] |
| 2.2 | ล็อกอิน `Evasi0m` (admin) → `/admin` เปิดได้ | [ ] |
| 2.3 | `/settings` เปลี่ยนรหัสผ่านได้ | [ ] |
| 2.4 | แอดมินรีเซ็ตรหัสผ่าน user: `POST /api/admin/users/{id}/reset-password` body `{"password":"..."}` | [ ] |
| 2.5 | Ban user → login ต้องถูกปฏิเสธ | [ ] |

---

## 3. Top-up TrueMoney (เงินจริง)

**ก่อนทดสอบ:** ตั้ง `TRUEWALLET_PHONE` (เบอร์รับซอง, ตัวเลขเท่านั้น) ที่ Railway → Variables แล้วรอ redeploy

| # | ขั้นตอน | ผ่าน |
|---|---------|------|
| 3.1 | ซื้อแพ็กเล็กสุด (1,000 หัวใจ) วางลิงก์ซองอั่งเปา → สถานะ `credited` | [ ] |
| 3.2 | เครดิตใน dashboard เพิ่มตรงแพ็ก | [ ] |
| 3.3 | (ถ้ามี) ใช้ coupon ลดราคา → ยอดตรง | [ ] |

### SOP: Top-up `needs_manual`

เมื่อ redeem ล้มเหลวหรือระบบตั้ง `needs_manual`:

1. แอดมิน → **`https://<vercel-domain>/admin/topups`** กรอง `needs_manual`
2. ตรวจ voucher / ยอด / user
3. กดเครดิตมือ หรือ API: `POST /api/admin/topups/{topup_id}/credit` body `{"note":"..."}`
4. ยืนยัน `credit_status = credited` และเครดิต user

---

## 4. Job / Worker (DevPlay จริง)

**ก่อนทดสอบ:**

- [ ] `backend/heart_farm/_descriptors.bin` ติดไปกับ image (ไม่โดน `.dockerignore` ตัด)
- [ ] Admin → **Proxy** เปิด proxy หมุน IP (แนะนำถ้าฟาร์มหนัก — Railway ใช้ IP datacenter ที่ DevPlay อาจบล็อก)
- [ ] Admin → **Worker Health** → Test Telegram (ถ้าตั้ง bot แล้ว)
- [ ] Railway → service `backend` **replicas = 1** (worker คิวเดียว)

| # | ขั้นตอน | ผ่าน |
|---|---------|------|
| 4.1 | ส่ง job 1 ไอดี DevPlay ถูกต้อง → `queued` → `processing` → `completed` | [ ] |
| 4.2 | หน้า `/queue` แสดงตำแหน่ง / progress / log | [ ] |
| 4.3 | WebSocket อัปเดต (log ไหล) | [ ] |
| 4.4 | Job ล้มถาวร (ทดสอบไอดีผิดหรือบังคับ fail) → เครดิต **คืน** (`refunded` / `credits_refunded`) | [ ] |
| 4.5 | Maintenance เปิด → สร้าง job ไม่ได้ | [ ] |
| 4.6 | Pause queue → worker ไม่หยิบงานใหม่ | [ ] |

### Worker smoke

```bash
curl -sS "https://<railway-domain>/health"
```

ผ่านเมื่อ `ok: true` และ `worker` รายงาน watchdog running  
ดู log ของ worker: Railway → service `backend` → **Deployments → View Logs**

---

## 5. โปรโมชั่น / Trial (ถ้าเปิด)

- [ ] Dashboard แสดง trial card → claim DevPlay (ไม่ซ้ำ email เดิม) → ได้เครดิต

---

## 6. Rollback หลัง deploy พัง

- **Railway** → Deployments → เลือก deployment ตัวก่อนหน้า → **Redeploy**
- **Vercel** → Deployments → deployment ตัวก่อนหน้า → **Promote to Production**
- ถ้าต้นเหตุอยู่ที่โค้ด: `git revert <sha>` แล้ว push เข้า `main` — ทั้งสองฝั่ง redeploy เอง

---

## บันทึกรอบล่าสุด (อัปเดตเมื่อรัน UAT)

| รายการ | ผล | หมายเหตุ |
|--------|-----|----------|
| API health | | |
| Web 200 | | |
| Packages API | | |
| Login admin | | ทดสอบมือ |
| Top-up จริง | | ทดสอบมือ |
| Job E2E | | ทดสอบมือ |
