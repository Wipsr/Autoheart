-- topup_redemptions: TrueMoney angpao payment history
CREATE TABLE IF NOT EXISTS public.topup_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    package_id INTEGER NOT NULL REFERENCES public.packages(id),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),

    voucher_url TEXT NOT NULL,
    voucher_id TEXT UNIQUE,
    amount_baht NUMERIC(10,2),

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'credited', 'failed', 'needs_manual', 'refunded')),
    credit_status TEXT DEFAULT 'pending'
        CHECK (credit_status IN ('pending', 'credited', 'needs_manual')),
    hearts_credited INTEGER DEFAULT 0,

    error_code TEXT,
    error_message TEXT,
    error_note TEXT,
    tmn_raw_response JSONB,

    admin_credited_by UUID REFERENCES public.profiles(id),
    admin_credited_at TIMESTAMPTZ,
    admin_note TEXT,

    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topup_user ON public.topup_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_topup_status ON public.topup_redemptions(status);
CREATE INDEX IF NOT EXISTS idx_topup_voucher ON public.topup_redemptions(voucher_id);

CREATE TRIGGER topup_redemptions_updated_at
    BEFORE UPDATE ON public.topup_redemptions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Atomic credit helper (service_role / SECURITY DEFINER)
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
        credits = credits + p_hearts,
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
        credits = credits - p_hearts,
        total_jobs = total_jobs + 1,
        updated_at = NOW()
    WHERE id = p_user_id AND credits >= p_hearts AND is_banned = FALSE;

    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    RETURN updated_rows = 1;
END;
$$;
