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
