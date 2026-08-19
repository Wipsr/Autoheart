-- Seed packages, default proxy row, system settings

INSERT INTO public.packages (name, slug, hearts, price_baht, description, badge, sort_order, is_active)
VALUES
    ('แพ็คเกจ 1,000 หัวใจ', '1000-hearts', 1000, 40.00, 'เหมาะสำหรับเริ่มต้น', NULL, 1, TRUE),
    ('แพ็คเกจ 2,000 หัวใจ', '2000-hearts', 2000, 69.00, 'คุ้มค่าที่สุด ประหยัดกว่า 14%', 'ยอดนิยม', 2, TRUE),
    ('แพ็คเกจ 3,000 หัวใจ', '3000-hearts', 3000, 99.00, 'สำหรับสายฟาร์มจริงจัง ประหยัดกว่า 18%', 'คุ้มสุด', 3, TRUE)
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
