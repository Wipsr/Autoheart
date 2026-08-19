-- Operational metadata for worker retries, health checks and alert history.
ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS failure_category TEXT,
    ADD CONSTRAINT jobs_failure_category_check CHECK (
        failure_category IS NULL OR failure_category IN ('transient', 'permanent', 'stuck', 'cancelled')
    );

CREATE INDEX IF NOT EXISTS idx_jobs_retry_due
    ON public.jobs(next_retry_at)
    WHERE status = 'queued' AND next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_processing_heartbeat
    ON public.jobs(last_heartbeat_at)
    WHERE status = 'processing';

CREATE TABLE IF NOT EXISTS public.worker_health_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL CHECK (event_type IN ('started', 'heartbeat', 'stuck_job', 'orphan_recovery', 'loop_error', 'stopped')),
    status TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'warning', 'critical')),
    message TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_worker_health_events_created
    ON public.worker_health_events(created_at DESC);

CREATE TABLE IF NOT EXISTS public.alert_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_key TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed', 'suppressed')),
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alert_events_key_created
    ON public.alert_events(alert_key, created_at DESC);

ALTER TABLE public.worker_health_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage worker health events" ON public.worker_health_events;
CREATE POLICY "admins manage worker health events" ON public.worker_health_events
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admins manage alert events" ON public.alert_events;
CREATE POLICY "admins manage alert events" ON public.alert_events
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.system_settings(key, value, description) VALUES
    ('worker_stuck_timeout_seconds', '180', 'Seconds without worker/job heartbeat before recovery'),
    ('worker_watchdog_interval_seconds', '15', 'Seconds between worker watchdog scans'),
    ('worker_retry_base_delay_seconds', '30', 'Base exponential retry delay in seconds'),
    ('worker_retry_max_attempts', '3', 'Maximum automatic attempts per transient job'),
    ('telegram_alert_cooldown_seconds', '300', 'Suppress duplicate Telegram alerts for this duration')
ON CONFLICT (key) DO NOTHING;

REVOKE ALL ON TABLE public.worker_health_events, public.alert_events FROM anon, authenticated;
