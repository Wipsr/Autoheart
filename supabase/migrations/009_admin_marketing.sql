-- Admin marketing, maintenance, and abuse-control systems.

INSERT INTO public.system_settings (key, value, description) VALUES
    ('maintenance_message', 'กำลังปรับปรุงระบบชั่วคราว', 'Message displayed during maintenance'),
    ('maintenance_eta', '', 'Optional maintenance completion estimate'),
    ('site_banner_enabled', 'false', 'Show public announcement banner'),
    ('site_banner_text', '', 'Public announcement banner text')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('new_user_trial')),
    hearts_reward INTEGER NOT NULL CHECK (hearts_reward > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    per_user_limit INTEGER NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
    requires_devplay BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER promotions_updated_at
    BEFORE UPDATE ON public.promotions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.promotion_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    devplay_email_normalized TEXT NOT NULL,
    devplay_email_hash TEXT NOT NULL,
    hearts_credited INTEGER NOT NULL CHECK (hearts_credited > 0),
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (promotion_id, user_id),
    UNIQUE (promotion_id, devplay_email_hash)
);

CREATE INDEX IF NOT EXISTS idx_promotion_claims_user ON public.promotion_claims(user_id);

CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
    min_amount_baht NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (min_amount_baht >= 0),
    max_discount_baht NUMERIC(10,2),
    max_uses INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    per_user_limit INTEGER,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    applicable_package_ids INTEGER[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT coupon_code_upper CHECK (code = upper(code)),
    CONSTRAINT coupon_percent_range CHECK (
        discount_type <> 'percent' OR discount_value <= 100
    )
);

CREATE TRIGGER coupons_updated_at
    BEFORE UPDATE ON public.coupons
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES public.coupons(id),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    topup_id UUID UNIQUE REFERENCES public.topup_redemptions(id) ON DELETE SET NULL,
    amount_before NUMERIC(10,2) NOT NULL,
    discount_baht NUMERIC(10,2) NOT NULL,
    amount_after NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON public.coupon_redemptions(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON public.coupon_redemptions(user_id);

CREATE TABLE IF NOT EXISTS public.site_popups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    dismiss_hours INTEGER NOT NULL DEFAULT 24 CHECK (dismiss_hours BETWEEN 1 AND 8760),
    priority INTEGER NOT NULL DEFAULT 0,
    show_on TEXT NOT NULL DEFAULT 'all' CHECK (show_on IN ('all', 'logged_out', 'logged_in')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER site_popups_updated_at
    BEFORE UPDATE ON public.site_popups
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    before_data JSONB,
    after_data JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.admin_audit_logs(entity_type, entity_id);

-- Atomically reserve coupon capacity after payment succeeds.
CREATE OR REPLACE FUNCTION public.record_coupon_redemption(
    p_coupon_id UUID,
    p_user_id UUID,
    p_topup_id UUID,
    p_amount_before NUMERIC,
    p_discount_baht NUMERIC,
    p_amount_after NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_coupon public.coupons;
    prior_uses INTEGER;
BEGIN
    SELECT * INTO current_coupon FROM public.coupons WHERE id = p_coupon_id FOR UPDATE;
    IF NOT FOUND OR NOT current_coupon.is_active
       OR (current_coupon.max_uses IS NOT NULL AND current_coupon.used_count >= current_coupon.max_uses) THEN
        RETURN FALSE;
    END IF;

    SELECT COUNT(*) INTO prior_uses
    FROM public.coupon_redemptions
    WHERE coupon_id = p_coupon_id AND user_id = p_user_id;
    IF current_coupon.per_user_limit IS NOT NULL AND prior_uses >= current_coupon.per_user_limit THEN
        RETURN FALSE;
    END IF;

    UPDATE public.coupons SET used_count = used_count + 1 WHERE id = p_coupon_id;
    INSERT INTO public.coupon_redemptions (
        coupon_id, user_id, topup_id, amount_before, discount_baht, amount_after
    ) VALUES (
        p_coupon_id, p_user_id, p_topup_id, p_amount_before, p_discount_baht, p_amount_after
    );
    RETURN TRUE;
END;
$$;

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_popups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY promotions_admin_all ON public.promotions
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY promotion_claims_admin_read ON public.promotion_claims
    FOR SELECT USING (public.is_admin() OR user_id = auth.uid());
CREATE POLICY coupons_admin_all ON public.coupons
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY coupon_redemptions_admin_read ON public.coupon_redemptions
    FOR SELECT USING (public.is_admin() OR user_id = auth.uid());
CREATE POLICY site_popups_admin_all ON public.site_popups
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY audit_logs_admin_read ON public.admin_audit_logs
    FOR SELECT USING (public.is_admin());

INSERT INTO public.promotions (
    slug, title, type, hearts_reward, is_active, requires_devplay, per_user_limit
) VALUES (
    'new-user-trial', 'สมาชิกใหม่ รับฟรี 100 หัวใจ', 'new_user_trial', 100, TRUE, TRUE, 1
) ON CONFLICT (slug) DO NOTHING;
