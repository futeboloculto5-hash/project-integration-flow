CREATE TABLE public.careers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  legacy_id text UNIQUE,
  legacy_user_id text,
  club_id text NOT NULL,
  club_name text NOT NULL,
  season text NOT NULL DEFAULT '2025',
  "current_date" timestamptz NOT NULL DEFAULT now(),
  balance bigint NOT NULL DEFAULT 0,
  transfer_budget bigint NOT NULL DEFAULT 0,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX careers_user_idx ON public.careers(user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.careers TO authenticated;
GRANT ALL ON public.careers TO service_role;
ALTER TABLE public.careers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own careers select" ON public.careers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own careers insert" ON public.careers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own careers update" ON public.careers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own careers delete" ON public.careers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Imported users from the previous app (server-controlled; no client access)
CREATE TABLE public.legacy_users (
  legacy_id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text,
  auth_user_id uuid UNIQUE,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.legacy_users TO service_role;
ALTER TABLE public.legacy_users ENABLE ROW LEVEL SECURITY;

-- Links a verified signed-in user to their imported identity by email and hands over their careers.
CREATE OR REPLACE FUNCTION public.claim_legacy_account()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_legacy text;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;
  SELECT email, email_confirmed_at INTO v_email, v_confirmed FROM auth.users WHERE id = v_uid;
  IF v_confirmed IS NULL OR v_email IS NULL THEN RETURN 0; END IF;
  SELECT legacy_id INTO v_legacy FROM public.legacy_users
    WHERE lower(email) = lower(v_email) AND (auth_user_id IS NULL OR auth_user_id = v_uid);
  IF v_legacy IS NULL THEN RETURN 0; END IF;
  UPDATE public.legacy_users SET auth_user_id = v_uid, claimed_at = coalesce(claimed_at, now()) WHERE legacy_id = v_legacy;
  UPDATE public.careers SET user_id = v_uid WHERE legacy_user_id = v_legacy AND user_id IS DISTINCT FROM v_uid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_legacy_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_legacy_account() TO authenticated;