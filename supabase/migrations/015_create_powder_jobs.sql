-- powder_jobs: งาน "ปั๊มผงเวทมนตร์" ที่เราสั่งต่อไปเข้าคิวของ ngmx
--
-- ทำไมไม่ใช้ตาราง jobs: jobs ผูกกับ worker ของเราเอง (target_hearts, คิว,
-- รหัสผ่านที่เข้ารหัสไว้ให้ worker ใช้) แต่งานปั๊มผงรันอยู่ฝั่ง ngmx ทั้งหมด
-- ตารางนี้จึงเก็บแค่ "ใครสั่งงานไหน" + สถานะล่าสุดที่ดึงกลับมา ไม่มีรหัสผ่าน
-- เก็บไว้เลย (ส่งต่อไป ngmx ตอนสั่งงานครั้งเดียวแล้วทิ้ง)
--
-- session ของ ngmx เป็นบัญชีบริการตัวเดียวร่วมกันทั้งระบบ รายการงานฝั่งเขาจึง
-- ปนกันทุกผู้ใช้ — ตารางนี้คือแหล่งความจริงเดียวว่างานไหนเป็นของใคร
CREATE TABLE IF NOT EXISTS public.powder_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- รหัสงานฝั่ง ngmx ใช้ดึงสถานะ/สั่งหยุด
    ngmx_job_id TEXT NOT NULL UNIQUE,

    devplay_email TEXT NOT NULL,
    requested_powder INTEGER NOT NULL,

    -- สถานะตามฝั่ง ngmx: queued / running / success / error / cancelled
    status TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER NOT NULL DEFAULT 0,
    status_line TEXT,
    delivered INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_powder_jobs_user ON public.powder_jobs(user_id, created_at DESC);

CREATE TRIGGER powder_jobs_updated_at
    BEFORE UPDATE ON public.powder_jobs
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- เปิด RLS แต่ไม่ประกาศ policy = client แตะตรงไม่ได้ ต้องผ่าน API ของเรา
-- (เหมือน saved_accounts) เพราะการอ่านสถานะต้อง sync กับ ngmx ก่อนเสมอ
ALTER TABLE public.powder_jobs ENABLE ROW LEVEL SECURITY;
