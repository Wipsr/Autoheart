-- SECURITY: backend service_role is the sole caller of privileged RPCs.
REVOKE EXECUTE ON FUNCTION public.credit_user_hearts(UUID, INTEGER, NUMERIC) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_user_hearts(UUID, INTEGER) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_active_job() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resequence_queue() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_coupon_redemption(UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
