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
