-- saved_accounts: บัญชีเกม DevPlay ที่ผู้ใช้ save ไว้ เพื่อไม่ต้องกรอก
-- email/password ซ้ำทุกครั้งที่ใช้ฟังก์ชัน (เช็คไอดี / ลบเพื่อน / สั่งฟาร์ม)
--
-- ความปลอดภัย: password เก็บแบบเข้ารหัส AES-GCM (core/security.py) ด้วยคีย์ที่
-- อยู่บนเซิร์ฟเวอร์เท่านั้น — client ไม่มีทางถอดได้ และ backend เท่านั้นที่แตะ
-- ตารางนี้ (ผ่าน service_role) จึงตั้ง RLS ให้ "ไม่มี" policy สำหรับ anon/auth
-- เลย เพื่อไม่ให้หน้าเว็บ query ciphertext ตรง ๆ ได้ ต้องผ่าน API ของเราเสมอ
CREATE TABLE IF NOT EXISTS public.saved_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    label TEXT NOT NULL DEFAULT '',
    devplay_email TEXT NOT NULL,
    devplay_password_encrypted TEXT NOT NULL,

    -- cache ไว้โชว์ในตัวเลือก (เติมตอน verify สำเร็จ) ไม่ใช่ข้อมูลลับ
    mid TEXT,
    nickname TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- อีเมลเดียวกันของ user คนเดียว save ซ้ำไม่ได้ (upsert ทับของเดิมแทน)
    UNIQUE (user_id, devplay_email)
);

CREATE INDEX IF NOT EXISTS idx_saved_accounts_user ON public.saved_accounts(user_id);

CREATE TRIGGER saved_accounts_updated_at
    BEFORE UPDATE ON public.saved_accounts
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- เปิด RLS แต่ไม่ประกาศ policy ใด ๆ = anon/auth เข้าไม่ได้เลย มีแต่ service_role
-- (backend) ที่ bypass RLS ได้ ตารางนี้ถือ ciphertext ของรหัสผ่านจึงกันไว้แน่น
ALTER TABLE public.saved_accounts ENABLE ROW LEVEL SECURITY;
