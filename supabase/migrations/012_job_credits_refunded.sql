-- Track automatic credit refunds when jobs fail permanently.
ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS credits_refunded BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_jobs_credits_refunded
    ON public.jobs(credits_refunded)
    WHERE status IN ('failed', 'refunded');
