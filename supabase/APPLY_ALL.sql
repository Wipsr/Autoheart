-- profiles: nickname-based auth (synthetic email nickname@autoheart.local)

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    email TEXT,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    credits INTEGER NOT NULL DEFAULT 0,
    total_spent_baht NUMERIC(10,2) DEFAULT 0,
    total_jobs INTEGER DEFAULT 0,
    is_banned BOOLEAN DEFAULT FALSE,
    banned_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT nickname_format CHECK (
        nickname ~ '^[A-Za-z0-9_]{3,24}$'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_nickname_unique_ci
    ON public.profiles (lower(nickname));
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_nickname ON public.profiles(nickname);

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

    CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    nick TEXT;
    user_role TEXT := 'user';
BEGIN
    nick := COALESCE(
        NULLIF(trim(NEW.raw_user_meta_data->>'nickname'), ''),
        split_part(NEW.email, '@', 1)
    );

    IF lower(nick) = 'evasi0m' THEN
        user_role := 'admin';
    END IF;

    INSERT INTO public.profiles (id, nickname, email, display_name, role)
    VALUES (
        NEW.id,
        nick,
        NEW.email,
        COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''), nick),
        user_role
    )
    ON CONFLICT (id) DO UPDATE SET
        nickname = EXCLUDED.nickname,
        email = EXCLUDED.email,
        display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
        role = CASE
            WHEN lower(EXCLUDED.nickname) = 'evasi0m' THEN 'admin'
            ELSE public.profiles.role
        END;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.nickname_to_auth_email(p_nickname TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    auth_email TEXT;
BEGIN
    SELECT email INTO auth_email
    FROM public.profiles
    WHERE lower(nickname) = lower(trim(p_nickname))
    LIMIT 1;
    RETURN auth_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.nickname_to_auth_email(TEXT) TO anon, authenticated;
-- packages: sellable heart farm packages
CREATE TABLE IF NOT EXISTS public.packages (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    hearts INTEGER NOT NULL,
    price_baht NUMERIC(10,2) NOT NULL,
    description TEXT,
    badge TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packages_active ON public.packages(is_active, sort_order);
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
-- jobs: heart farm work units
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    topup_id UUID REFERENCES public.topup_redemptions(id),
    package_id INTEGER REFERENCES public.packages(id),

    devplay_email TEXT NOT NULL,
    devplay_password_encrypted TEXT NOT NULL,

    target_hearts INTEGER NOT NULL,

    queue_position INTEGER,

    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN (
            'queued',
            'validating',
            'validation_failed',
            'processing',
            'completed',
            'failed',
            'cancelled',
            'refunded'
        )),

    hearts_collected INTEGER DEFAULT 0,
    current_session INTEGER DEFAULT 0,
    total_sessions INTEGER DEFAULT 0,
    progress_percent NUMERIC(5,2) DEFAULT 0,
    progress_message TEXT,

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    estimated_duration_minutes INTEGER,
    actual_duration_seconds INTEGER,

    error_message TEXT,
    error_detail JSONB,
    retry_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_user ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_queue ON public.jobs(queue_position) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_jobs_created ON public.jobs(created_at DESC);

CREATE TRIGGER jobs_updated_at
    BEFORE UPDATE ON public.jobs
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
-- job_logs: per-job execution log stream
CREATE TABLE IF NOT EXISTS public.job_logs (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,

    level TEXT NOT NULL DEFAULT 'info'
        CHECK (level IN ('debug', 'info', 'warning', 'error', 'critical')),

    message TEXT NOT NULL,
    data JSONB,
    source TEXT DEFAULT 'worker',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_logs_job ON public.job_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_level ON public.job_logs(level) WHERE level IN ('error', 'critical');
CREATE INDEX IF NOT EXISTS idx_job_logs_created ON public.job_logs(job_id, created_at);
-- proxy_config + system_settings (admin-configurable)
CREATE TABLE IF NOT EXISTS public.proxy_config (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'default',
    proxy_url TEXT NOT NULL DEFAULT '',
    is_enabled BOOLEAN DEFAULT FALSE,
    last_tested_at TIMESTAMPTZ,
    last_test_ok BOOLEAN,
    last_test_message TEXT,
    updated_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER proxy_config_updated_at
    BEFORE UPDATE ON public.proxy_config
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    description TEXT,
    updated_by UUID REFERENCES public.profiles(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER system_settings_updated_at
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
-- Fair queue helpers (depends on jobs + system_settings)

CREATE OR REPLACE FUNCTION public.get_active_job()
RETURNS SETOF public.jobs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT * FROM public.jobs
    WHERE status = 'processing'
    ORDER BY started_at ASC NULLS LAST
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.resequence_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    strategy TEXT;
    r RECORD;
    pos INTEGER := 1;
BEGIN
    SELECT value INTO strategy
    FROM public.system_settings
    WHERE key = 'queue_strategy'
    LIMIT 1;

    IF strategy IS NULL OR strategy = '' THEN
        strategy := 'fair';
    END IF;

    UPDATE public.jobs SET queue_position = NULL WHERE status <> 'queued';

    IF strategy = 'fifo' THEN
        FOR r IN
            SELECT id FROM public.jobs
            WHERE status = 'queued'
            ORDER BY created_at ASC
        LOOP
            UPDATE public.jobs SET queue_position = pos WHERE id = r.id;
            pos := pos + 1;
        END LOOP;
    ELSE
        WITH ranked AS (
            SELECT
                id,
                user_id,
                created_at,
                ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) AS user_job_rank,
                ROW_NUMBER() OVER (ORDER BY created_at ASC) AS global_rank
            FROM public.jobs
            WHERE status = 'queued'
        ),
        ordered AS (
            SELECT id,
                   ROW_NUMBER() OVER (ORDER BY user_job_rank ASC, created_at ASC, global_rank ASC) AS new_pos
            FROM ranked
        )
        UPDATE public.jobs j
        SET queue_position = o.new_pos
        FROM ordered o
        WHERE j.id = o.id;
    END IF;
END;
$$;
-- Row Level Security policies

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topup_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proxy_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Helper: is current user admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin' AND is_banned = FALSE
    );
$$;

-- profiles
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
    FOR SELECT USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
    FOR UPDATE USING (auth.uid() = id OR public.is_admin())
    WITH CHECK (auth.uid() = id OR public.is_admin());

-- packages: public read active; admin full
DROP POLICY IF EXISTS packages_select_active ON public.packages;
CREATE POLICY packages_select_active ON public.packages
    FOR SELECT USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS packages_admin_all ON public.packages;
CREATE POLICY packages_admin_all ON public.packages
    FOR ALL USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- topup_redemptions
DROP POLICY IF EXISTS topups_select_own ON public.topup_redemptions;
CREATE POLICY topups_select_own ON public.topup_redemptions
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS topups_insert_own ON public.topup_redemptions;
CREATE POLICY topups_insert_own ON public.topup_redemptions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS topups_admin_update ON public.topup_redemptions;
CREATE POLICY topups_admin_update ON public.topup_redemptions
    FOR UPDATE USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- jobs
DROP POLICY IF EXISTS jobs_select_own ON public.jobs;
CREATE POLICY jobs_select_own ON public.jobs
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS jobs_insert_own ON public.jobs;
CREATE POLICY jobs_insert_own ON public.jobs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS jobs_update_own_or_admin ON public.jobs;
CREATE POLICY jobs_update_own_or_admin ON public.jobs
    FOR UPDATE USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- job_logs: users see own job logs; admin all
DROP POLICY IF EXISTS job_logs_select_own ON public.job_logs;
CREATE POLICY job_logs_select_own ON public.job_logs
    FOR SELECT USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.jobs j
            WHERE j.id = job_id AND j.user_id = auth.uid()
        )
    );

-- job_logs inserts: service_role only (bypasses RLS). No client insert policy.

-- proxy_config: admin only
DROP POLICY IF EXISTS proxy_admin_all ON public.proxy_config;
CREATE POLICY proxy_admin_all ON public.proxy_config
    FOR ALL USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- system_settings: admin write; authenticated read of non-secret keys via backend preferred
DROP POLICY IF EXISTS settings_admin_all ON public.system_settings;
CREATE POLICY settings_admin_all ON public.system_settings
    FOR ALL USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS settings_select_public_keys ON public.system_settings;
CREATE POLICY settings_select_public_keys ON public.system_settings
    FOR SELECT USING (
        public.is_admin()
        OR key IN ('queue_strategy', 'maintenance_mode', 'site_notice')
    );

-- Realtime publication (optional)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'jobs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'job_logs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.job_logs;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
-- Seed packages, default proxy row, system settings

INSERT INTO public.packages (name, slug, hearts, price_baht, description, badge, sort_order, is_active)
VALUES
    ('แพ็คเกจ 1,000 หัวใจ', '1000-hearts', 1000, 49.00, 'เหมาะสำหรับเริ่มต้น', NULL, 1, TRUE),
    ('แพ็คเกจ 2,000 หัวใจ', '2000-hearts', 2000, 69.00, 'คุ้มค่าที่สุด ประหยัดกว่า 30%', 'ยอดนิยม', 2, TRUE),
    ('แพ็คเกจ 3,000 หัวใจ', '3000-hearts', 3000, 99.00, 'สำหรับสายฟาร์มจริงจัง ประหยัดกว่า 33%', 'คุ้มสุด', 3, TRUE)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    hearts = EXCLUDED.hearts,
    price_baht = EXCLUDED.price_baht,
    description = EXCLUDED.description,
    badge = EXCLUDED.badge,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;

INSERT INTO public.proxy_config (name, proxy_url, is_enabled)
SELECT 'default', '', FALSE
WHERE NOT EXISTS (SELECT 1 FROM public.proxy_config LIMIT 1);

INSERT INTO public.system_settings (key, value, description) VALUES
    ('queue_strategy', 'fair', 'fair = interleaved round-robin per user; fifo = strict FIFO'),
    ('truemoney_phone_override', '', 'Optional override for TRUEWALLET_PHONE (empty = use ENV)'),
    ('maintenance_mode', 'false', 'When true, block new topups and jobs'),
    ('site_notice', '', 'Optional banner message shown on dashboard'),
    ('hearts_per_minute', '50', 'Throughput estimate for wait-time calculation'),
    ('queue_paused', 'false', 'Pause worker picking jobs')
ON CONFLICT (key) DO NOTHING;
