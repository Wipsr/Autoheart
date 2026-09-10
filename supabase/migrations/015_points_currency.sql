-- 015: เปลี่ยนสกุลเงินของระบบจาก "เครดิตหัวใจ" เป็น "พอยท์ (Point)"
--
-- ขอบเขต: เฉพาะคอลัมน์/ฟังก์ชันที่เป็น *สกุลเงิน* เท่านั้น
-- คอลัมน์ที่เป็นหัวใจในเกมจริง ๆ (jobs.target_hearts, jobs.hearts_collected,
-- system_settings.hearts_per_minute) คงชื่อเดิมไว้ เพราะมันคือจำนวนหัวใจที่
-- worker ไปเก็บมาจริง ไม่ใช่ยอดเงินในบัญชีผู้ใช้
--
-- อัตราแลกยังเป็น 1 พอยท์ = 1 หัวใจ ตัวเลขเดิมทั้งหมดจึงย้ายมาตรง ๆ ได้
--
-- รันได้ซ้ำ (idempotent)
--
-- ลำดับ deploy: รัน migration นี้แล้ว **ต้อง deploy backend ใหม่ทันที**
-- wrapper ท้ายไฟล์กันได้แค่ฝั่ง RPC เท่านั้น ส่วน backend เก่ายังอ่าน/เขียน
-- คอลัมน์ตรง ๆ อยู่ (profiles.credits, packages.hearts, hearts_credited,
-- credits_refunded) ซึ่งจะพังทันทีที่ rename เสร็จ
-- เลือกจังหวะที่ไม่มีงานรันและไม่มีซองค้าง

-- ── 1) คอลัมน์สกุลเงิน ────────────────────────────────────────────────

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('profiles',           'credits',         'points'),
            ('packages',           'hearts',          'points'),
            ('topup_redemptions',  'hearts_credited', 'points_credited'),
            ('promotions',         'hearts_reward',   'points_reward'),
            ('promotion_claims',   'hearts_credited', 'points_credited'),
            ('jobs',               'credits_refunded','points_refunded')
        ) AS t(tbl, old_col, new_col)
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = r.old_col
        ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = r.new_col
        ) THEN
            EXECUTE format('ALTER TABLE public.%I RENAME COLUMN %I TO %I', r.tbl, r.old_col, r.new_col);
        END IF;
    END LOOP;
END $$;

-- index ของ 012 ถูก rename ตามคอลัมน์อัตโนมัติ แต่ชื่อยังเป็นของเก่า
ALTER INDEX IF EXISTS idx_jobs_credits_refunded RENAME TO idx_jobs_points_refunded;

-- ── 2) จำนวนพอยท์ที่หักไว้กับงาน ──────────────────────────────────────
-- เดิมโค้ดคืนพอยท์โดยอ่าน target_hearts มาใช้เป็นยอด ซึ่งผูกกับสมมติฐาน
-- 1:1 อยู่กลาย ๆ เก็บยอดที่หักจริงไว้กับงานเลย จะได้เปลี่ยนอัตราภายหลังได้
-- โดยไม่ต้องแก้ตรรกะการคืนเงิน

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS points_spent INTEGER NOT NULL DEFAULT 0;

UPDATE public.jobs
SET points_spent = target_hearts
WHERE points_spent = 0;

-- ── 3) RPC สกุลเงิน ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.credit_user_points(
    p_user_id UUID,
    p_points INTEGER,
    p_baht NUMERIC DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.profiles
    SET
        points = points + p_points,
        total_spent_baht = total_spent_baht + COALESCE(p_baht, 0),
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_user_points(
    p_user_id UUID,
    p_points INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    updated_rows INTEGER;
BEGIN
    UPDATE public.profiles
    SET
        points = points - p_points,
        total_jobs = total_jobs + 1,
        updated_at = NOW()
    WHERE id = p_user_id AND points >= p_points AND is_banned = FALSE;

    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    RETURN updated_rows = 1;
END;
$$;

-- ── 4) ชื่อเดิมกลายเป็น wrapper ──────────────────────────────────────
-- ลดพื้นที่พังของ backend รุ่นเก่าระหว่างช่วงเปลี่ยนผ่าน (เฉพาะฝั่ง RPC
-- ไม่ครอบคลุมการอ่าน/เขียนคอลัมน์ตรง ๆ) ลบทิ้งได้เมื่อ Railway รันโค้ดใหม่แล้ว

CREATE OR REPLACE FUNCTION public.credit_user_hearts(
    p_user_id UUID,
    p_hearts INTEGER,
    p_baht NUMERIC DEFAULT 0
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.credit_user_points(p_user_id, p_hearts, p_baht);
$$;

CREATE OR REPLACE FUNCTION public.deduct_user_hearts(
    p_user_id UUID,
    p_hearts INTEGER
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.deduct_user_points(p_user_id, p_hearts);
$$;

-- ── 5) สิทธิ์: backend (service_role) เป็นผู้เรียกฟังก์ชันเหล่านี้เท่านั้น ──
-- ตามหลักเดียวกับ 010_harden_rpc_permissions.sql

REVOKE EXECUTE ON FUNCTION public.credit_user_points(UUID, INTEGER, NUMERIC) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_user_points(UUID, INTEGER) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_user_hearts(UUID, INTEGER, NUMERIC) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_user_hearts(UUID, INTEGER) FROM anon, authenticated;

-- ── 6) ข้อความที่ผู้ใช้เห็น ───────────────────────────────────────────
-- slug คงเดิม เพราะ seed.sql กับ topup ใช้เป็น key อ้างอิงแพ็กเกจ

-- เขียนแบบกวาดทั้งตาราง ไม่เจาะจง slug เพราะแอดมินเพิ่มแพ็กเองได้
-- (production มีแพ็ก 10,000 ที่ไม่ได้มาจาก seed)
UPDATE public.packages
SET name = replace(name, 'หัวใจ', 'พอยท์')
WHERE name LIKE '%หัวใจ%';
