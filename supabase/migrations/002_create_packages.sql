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
