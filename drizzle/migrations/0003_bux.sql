-- Bux: moeda FICTÍCIA do jogo. Preços e recompensas são regras internas, sem relação com dinheiro real.
-- O cliente só LÊ. Todo saldo muda por funções no servidor, com chave de idempotência e saldo travado.

CREATE TABLE public.bux_catalog (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('club_unlock','energy_buff','medical_buff','reward')),
  name text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  duration_days integer,
  club_id text
);
INSERT INTO public.bux_catalog (id, kind, name, amount, duration_days, club_id) VALUES
('club_botafogo','club_unlock','Desbloquear Botafogo',800,NULL,'botafogo'),
('club_flamengo','club_unlock','Desbloquear Flamengo',1500,NULL,'flamengo'),
('club_palmeiras','club_unlock','Desbloquear Palmeiras',1500,NULL,'palmeiras'),
('energy_basic','energy_buff','Energia básica',120,7,NULL),
('energy_pro','energy_buff','Energia profissional',300,14,NULL),
('medical_basic','medical_buff','Departamento médico básico',150,14,NULL),
('medical_pro','medical_buff','Departamento médico profissional',400,30,NULL),
('reward_welcome','reward','Boas-vindas',100,NULL,NULL),
('reward_first_win','reward','Primeira vitória da carreira',50,NULL,NULL),
('reward_season_played','reward','Temporada concluída',200,NULL,NULL),
('reward_cup_champion','reward','Campeão da copa',300,NULL,NULL),
('reward_promotion','reward','Acesso à divisão superior',250,NULL,NULL);

CREATE TABLE public.bux_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bux_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('grant','purchase')),
  item_id text NOT NULL REFERENCES public.bux_catalog(id),
  amount bigint NOT NULL,
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX bux_transactions_user_idx ON public.bux_transactions(user_id, created_at DESC);
CREATE TABLE public.bux_unlocks (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES public.bux_catalog(id),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

-- Somente leitura para o usuário; nenhuma política de escrita.
GRANT SELECT ON public.bux_catalog, public.bux_wallets, public.bux_transactions, public.bux_unlocks TO authenticated;
GRANT ALL ON public.bux_catalog, public.bux_wallets, public.bux_transactions, public.bux_unlocks TO service_role;
ALTER TABLE public.bux_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bux_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bux_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bux_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bux catalog read" ON public.bux_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "bux own wallet read" ON public.bux_wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "bux own transactions read" ON public.bux_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "bux own unlocks read" ON public.bux_unlocks FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Núcleo único de compra/recompensa. Não é chamável pelo cliente (veja os REVOKE abaixo).
CREATE OR REPLACE FUNCTION public.bux_apply(p_item text, p_key text, p_reward boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.bux_catalog;
  v_tx public.bux_transactions;
  v_balance bigint;
  v_delta bigint;
  v_earned bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_item FROM public.bux_catalog WHERE id = p_item;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_item'; END IF;
  IF (v_item.kind = 'reward') <> p_reward THEN RAISE EXCEPTION 'wrong_operation'; END IF;
  IF p_key IS NULL OR length(p_key) < 8 OR length(p_key) > 120 THEN RAISE EXCEPTION 'invalid_key'; END IF;
  IF p_reward AND NOT (CASE WHEN p_item = 'reward_welcome' THEN p_key = 'reward:reward_welcome:account' ELSE left(p_key, length('reward:' || p_item || ':')) = 'reward:' || p_item || ':' END) THEN
    RAISE EXCEPTION 'invalid_key';
  END IF;

  INSERT INTO public.bux_wallets (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  -- Trava a carteira: pedidos simultâneos do mesmo usuário entram em fila.
  SELECT balance INTO v_balance FROM public.bux_wallets WHERE user_id = v_uid FOR UPDATE;

  SELECT * INTO v_tx FROM public.bux_transactions WHERE user_id = v_uid AND idempotency_key = p_key;
  IF FOUND THEN
    IF v_tx.item_id <> p_item THEN RAISE EXCEPTION 'key_reused'; END IF;
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'balance', v_balance, 'item', p_item);
  END IF;

  v_delta := CASE WHEN p_reward THEN v_item.amount ELSE -v_item.amount END;
  IF v_balance + v_delta < 0 THEN RAISE EXCEPTION 'insufficient_funds'; END IF;

  IF p_reward AND p_item <> 'reward_welcome' THEN
    SELECT coalesce(sum(amount), 0) INTO v_earned FROM public.bux_transactions
      WHERE user_id = v_uid AND kind = 'grant' AND item_id <> 'reward_welcome'
        AND created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
    IF v_earned + v_item.amount > 600 THEN RAISE EXCEPTION 'daily_cap'; END IF;
  END IF;

  IF v_item.kind = 'club_unlock' THEN
    INSERT INTO public.bux_unlocks (user_id, item_id) VALUES (v_uid, p_item) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RAISE EXCEPTION 'already_unlocked'; END IF;
  END IF;

  UPDATE public.bux_wallets SET balance = balance + v_delta, updated_at = now() WHERE user_id = v_uid RETURNING balance INTO v_balance;
  INSERT INTO public.bux_transactions (user_id, idempotency_key, kind, item_id, amount, balance_after)
    VALUES (v_uid, p_key, CASE WHEN p_reward THEN 'grant' ELSE 'purchase' END, p_item, v_delta, v_balance);
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'balance', v_balance, 'item', p_item);
END;
$$;

CREATE OR REPLACE FUNCTION public.bux_purchase(p_item text, p_key text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT public.bux_apply(p_item, p_key, false) $$;
CREATE OR REPLACE FUNCTION public.bux_claim_reward(p_item text, p_key text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT public.bux_apply(p_item, p_key, true) $$;

REVOKE ALL ON FUNCTION public.bux_apply(text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bux_purchase(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bux_claim_reward(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bux_purchase(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bux_claim_reward(text, text) TO authenticated;