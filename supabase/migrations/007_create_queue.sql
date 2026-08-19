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
