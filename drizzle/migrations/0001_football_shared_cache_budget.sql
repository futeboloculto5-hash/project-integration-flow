CREATE TABLE public.football_api_cache (request_key text PRIMARY KEY, payload jsonb, fetched_at timestamptz, locked_until timestamptz);
GRANT ALL ON public.football_api_cache TO service_role;
ALTER TABLE public.football_api_cache ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.football_api_budget (day date PRIMARY KEY, used integer NOT NULL DEFAULT 0, blocked_until timestamptz);
GRANT ALL ON public.football_api_budget TO service_role;
ALTER TABLE public.football_api_budget ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.reserve_football_request(p_key text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; b timestamptz; l timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(741923);
 INSERT INTO public.football_api_budget(day) VALUES ((now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING;
 SELECT used, blocked_until INTO n,b FROM public.football_api_budget WHERE day=(now() AT TIME ZONE 'UTC')::date;
 IF n >= 90 OR b > now() THEN RETURN 'quota'; END IF;
 SELECT locked_until INTO l FROM public.football_api_cache WHERE request_key=p_key;
 IF l > now() THEN RETURN 'busy'; END IF;
 INSERT INTO public.football_api_cache(request_key,locked_until) VALUES (p_key,now()+interval '20 seconds') ON CONFLICT(request_key) DO UPDATE SET locked_until=excluded.locked_until;
 UPDATE public.football_api_budget SET used=used+1 WHERE day=(now() AT TIME ZONE 'UTC')::date;
 RETURN 'ok';
END; $$;
REVOKE ALL ON FUNCTION public.reserve_football_request(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_football_request(text) TO service_role;