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
