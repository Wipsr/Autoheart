-- 017: แยก "พอยท์" กับ "หัวใจ" ออกจากกันจริง ๆ
--
-- ตั้งแต่ 015 พอยท์กับหัวใจเป็นเลขเดียวกัน (1 พอยท์ = 1 หัวใจ) ตอนนี้แยกคืน:
--
--   points  = กระเป๋าเงินที่เติมค้างไว้ในระบบด้วยอั่งเปา (1 บาท = 1 พอยท์ เสมอ
--             ไม่ผูกกับแพ็กเกจ เติมเท่าไหร่ก็ได้)
--   hearts  = ยอดหัวใจที่ใช้สั่งงานฟาร์มได้จริง ได้มาจาก (ก) แลกพอยท์ด้วยเรต
--             ของแพ็กเกจที่เลือก (ข) จ่ายอั่งเปาตรงตามราคาแพ็กเกจตอนสั่งงานเลย
--             (ค) เหลือจากงานที่ยกเลิก/พัง แล้วระบบคืนหัวใจกลับมา
--
-- เรตแลกพอยท์ -> หัวใจ ใช้ price_baht/points ของ packages ตัวเดิม (เช่น
-- 49 บาท (=49 พอยท์) = 1000 หัวใจ ตามแพ็กนั้น) ไม่ทำเรตกลางแยกต่างหาก
--
-- รันได้ซ้ำ (idempotent)

-- ── 1) คอลัมน์ ────────────────────────────────────────────────────────

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS hearts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'heart'
        CHECK (payment_method IN ('heart', 'point', 'angpao'));

-- เติมพอยท์ทั่วไปไม่ผูกแพ็กเกจได้ (แค่เติมเงินค้างไว้ ไม่ใช่ซื้อของ)
ALTER TABLE public.topup_redemptions
    ALTER COLUMN package_id DROP NOT NULL;

ALTER TABLE public.topup_redemptions
    ADD COLUMN IF NOT EXISTS credit_target TEXT NOT NULL DEFAULT 'points'
        CHECK (credit_target IN ('points', 'hearts')),
    ADD COLUMN IF NOT EXISTS hearts_credited INTEGER NOT NULL DEFAULT 0;

-- ── 2) RPC สกุลเงิน ──────────────────────────────────────────────────
-- credit_user_hearts / deduct_user_hearts เดิมเป็นแค่ wrapper เรียก
-- credit_user_points/deduct_user_points (สมัย 1 พอยท์ = 1 หัวใจ) ตอนนี้ทำงาน
-- กับคอลัมน์ hearts จริง ๆ

CREATE OR REPLACE FUNCTION public.credit_user_hearts(
    p_user_id UUID,
    p_hearts INTEGER,
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
        hearts = hearts + p_hearts,
        total_spent_baht = total_spent_baht + COALESCE(p_baht, 0),
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_user_hearts(
    p_user_id UUID,
    p_hearts INTEGER
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
        hearts = hearts - p_hearts,
        total_jobs = total_jobs + 1,
        updated_at = NOW()
    WHERE id = p_user_id AND hearts >= p_hearts AND is_banned = FALSE;

    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    RETURN updated_rows = 1;
END;
$$;

-- จ่ายค่างานด้วยพอยท์ตรง ๆ (ไม่ผ่านยอดหัวใจเลย เพราะแลกแล้วใช้ทันที)
CREATE OR REPLACE FUNCTION public.pay_job_with_points(
    p_user_id UUID,
    p_points_cost INTEGER
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
        points = points - p_points_cost,
        total_jobs = total_jobs + 1,
        updated_at = NOW()
    WHERE id = p_user_id AND points >= p_points_cost AND is_banned = FALSE;

    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    RETURN updated_rows = 1;
END;
$$;

-- แลกพอยท์เป็นหัวใจล่วงหน้า (หน้าเว็บ "แลกหัวใจ") ไม่เกี่ยวกับงาน
CREATE OR REPLACE FUNCTION public.convert_points_to_hearts(
    p_user_id UUID,
    p_points_cost INTEGER,
    p_hearts_amount INTEGER
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
        points = points - p_points_cost,
        hearts = hearts + p_hearts_amount,
        updated_at = NOW()
    WHERE id = p_user_id AND points >= p_points_cost AND is_banned = FALSE;

    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    RETURN updated_rows = 1;
END;
$$;

-- จ่ายด้วยอั่งเปาตรง ๆ ตอนสั่งงาน (เงินไม่เข้ากระเป๋าไหนเลย ใช้แล้วหมดไป)
-- ยังต้องนับ total_jobs เหมือนเส้นทางอื่น
CREATE OR REPLACE FUNCTION public.bump_total_jobs(
    p_user_id UUID,
    p_count INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.profiles
    SET total_jobs = total_jobs + p_count, updated_at = NOW()
    WHERE id = p_user_id;
END;
$$;

-- ── 3) ชื่อแพ็กเกจ ───────────────────────────────────────────────────
-- 015 เคยเปลี่ยน "หัวใจ" ในชื่อแพ็กเป็น "พอยท์" ตอนรวมสองสกุลเข้าด้วยกัน
-- ตอนนี้แพ็กเกจคือของที่ซื้อแล้วได้ "หัวใจ" (ไม่ใช่พอยท์) เปลี่ยนชื่อกลับ
-- (สแกนทั้งตาราง ไม่เจาะจง slug เพราะแอดมินเพิ่มแพ็กเองได้)

UPDATE public.packages
SET name = replace(name, 'พอยท์', 'หัวใจ')
WHERE name LIKE '%พอยท์%';

-- ── 4) สิทธิ์: backend (service_role) เท่านั้น ──────────────────────────

REVOKE EXECUTE ON FUNCTION public.credit_user_hearts(UUID, INTEGER, NUMERIC) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_user_hearts(UUID, INTEGER) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pay_job_with_points(UUID, INTEGER) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.convert_points_to_hearts(UUID, INTEGER, INTEGER) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_total_jobs(UUID, INTEGER) FROM anon, authenticated;
