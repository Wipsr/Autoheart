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
