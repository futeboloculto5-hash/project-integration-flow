-- Bux, economia nova: moeda FICTÍCIA. Preços e metas são regras internas do jogo, sem relação com dinheiro real.
-- Clubes: os 4 mais fracos são grátis; os outros custam de 5 a 100 Bux conforme a força.
-- Metas diárias substituem a recompensa de login: no máximo 20 Bux por dia (dia de Brasília).
-- Não apaga carteiras, transações nem desbloqueios: itens antigos ficam no catálogo como inativos.

ALTER TABLE public.bux_catalog ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.bux_catalog DROP CONSTRAINT IF EXISTS bux_catalog_kind_check;
ALTER TABLE public.bux_catalog ADD CONSTRAINT bux_catalog_kind_check CHECK (kind IN ('club_unlock','energy_buff','medical_buff','reward','goal'));
UPDATE public.bux_catalog SET active = false;

INSERT INTO public.bux_catalog (id, kind, name, amount, duration_days, club_id) VALUES
('club_ceara','club_unlock','Desbloquear Ceará',5,NULL,'ceara'),
('club_santos','club_unlock','Desbloquear Santos',25,NULL,'santos'),
('club_fortaleza','club_unlock','Desbloquear Fortaleza',30,NULL,'fortaleza'),
('club_vasco','club_unlock','Desbloquear Vasco',30,NULL,'vasco'),
('club_bragantino','club_unlock','Desbloquear Red Bull Bragantino',30,NULL,'bragantino'),
('club_corinthians','club_unlock','Desbloquear Corinthians',40,NULL,'corinthians'),
('club_gremio','club_unlock','Desbloquear Grêmio',40,NULL,'gremio'),
('club_fluminense','club_unlock','Desbloquear Fluminense',45,NULL,'fluminense'),
('club_internacional','club_unlock','Desbloquear Internacional',45,NULL,'internacional'),
('club_sao_paulo','club_unlock','Desbloquear São Paulo',45,NULL,'sao-paulo'),
('club_bahia','club_unlock','Desbloquear Bahia',45,NULL,'bahia'),
('club_atletico_mg','club_unlock','Desbloquear Atlético-MG',60,NULL,'atletico-mg'),
('club_cruzeiro','club_unlock','Desbloquear Cruzeiro',60,NULL,'cruzeiro'),
('club_botafogo','club_unlock','Desbloquear Botafogo',75,NULL,'botafogo'),
('club_flamengo','club_unlock','Desbloquear Flamengo',95,NULL,'flamengo'),
('club_palmeiras','club_unlock','Desbloquear Palmeiras',100,NULL,'palmeiras'),
('energy_basic','energy_buff','Energia básica',10,7,NULL),
('energy_pro','energy_buff','Energia profissional',25,14,NULL),
('medical_basic','medical_buff','Departamento médico básico',12,14,NULL),
('medical_pro','medical_buff','Departamento médico profissional',30,30,NULL),
('goal_play_5','goal','Jogar 5 partidas',3,NULL,NULL),
('goal_win_10','goal','Ganhar 10 partidas',5,NULL,NULL),
('goal_season','goal','Terminar uma temporada',10,NULL,NULL),
('goal_cup_win','goal','Vencer uma partida de copa',4,NULL,NULL),
('goal_score_10','goal','Marcar 10 gols',3,NULL,NULL),
('goal_clean_3','goal','Não sofrer gols em 3 partidas',4,NULL,NULL)
ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, name = EXCLUDED.name, amount = EXCLUDED.amount,
  duration_days = EXCLUDED.duration_days, club_id = EXCLUDED.club_id, active = true;

-- Núcleo único de compra/meta. Não é chamável pelo cliente (veja os REVOKE abaixo).
CREATE OR REPLACE FUNCTION public.bux_apply(p_item text, p_key text, p_reward boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.bux_catalog;
  v_tx public.bux_transactions;
  v_balance bigint;
  v_delta bigint;
  v_earned bigint;
  v_today text := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_item FROM public.bux_catalog WHERE id = p_item AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_item'; END IF;
  IF (v_item.kind = 'goal') <> p_reward THEN RAISE EXCEPTION 'wrong_operation'; END IF;
  IF p_key IS NULL OR length(p_key) < 8 OR length(p_key) > 120 THEN RAISE EXCEPTION 'invalid_key'; END IF;
  -- A chave de meta carrega a data de hoje: cada meta vale uma vez por dia.
  IF p_reward AND p_key <> 'goal:' || p_item || ':' || v_today THEN RAISE EXCEPTION 'invalid_key'; END IF;

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

  IF p_reward THEN
    SELECT coalesce(sum(amount), 0) INTO v_earned FROM public.bux_transactions
      WHERE user_id = v_uid AND kind = 'grant'
        AND created_at >= (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo');
    IF v_earned + v_item.amount > 20 THEN RAISE EXCEPTION 'daily_cap'; END IF;
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

REVOKE ALL ON FUNCTION public.bux_apply(text, text, boolean) FROM PUBLIC, anon, authenticated;
