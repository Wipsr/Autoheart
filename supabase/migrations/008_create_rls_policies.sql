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
