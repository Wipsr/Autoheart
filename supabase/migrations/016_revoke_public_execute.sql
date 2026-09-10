-- 016: ปิดรูสิทธิ์ RPC ที่ 010 ตั้งใจปิดแต่ปิดไม่ลง
--
-- 010 เขียน REVOKE EXECUTE ... FROM anon, authenticated ซึ่งไม่พอ
-- เพราะ CREATE FUNCTION ให้ EXECUTE กับ PUBLIC มาตั้งแต่ต้น การถอนสิทธิ์
-- ของ role ย่อยไม่ได้ถอนสิทธิ์ที่ได้มาทาง PUBLIC ออก
-- ผลคือ credit_user_hearts เรียกได้จริงผ่าน /rest/v1/rpc/ ทั้งที่ล็อกอิน
-- ธรรมดาและไม่ล็อกอิน — เติมพอยท์ให้ตัวเองได้ไม่จำกัด
--
-- ต้อง REVOKE จาก PUBLIC แล้วค่อย GRANT คืนให้ service_role อย่างเดียว
--
-- ไม่แตะ 2 ตัวนี้โดยตั้งใจ:
--   is_admin()              — RLS policy เรียกในนามผู้ใช้ที่ query ถ้าถอนสิทธิ์ policy จะพังทั้งระบบ
--   nickname_to_auth_email() — หน้าล็อกอินเรียกก่อนมี session 001 ตั้งใจ grant ไว้

DO $$
DECLARE
    fn TEXT;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'public.credit_user_points(UUID, INTEGER, NUMERIC)',
        'public.deduct_user_points(UUID, INTEGER)',
        'public.credit_user_hearts(UUID, INTEGER, NUMERIC)',
        'public.deduct_user_hearts(UUID, INTEGER)',
        'public.get_active_job()',
        'public.resequence_queue()',
        'public.record_coupon_redemption(UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC)',
        'public.handle_new_user()'
    ]
    LOOP
        IF to_regprocedure(fn) IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', fn);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
        END IF;
    END LOOP;
END $$;
