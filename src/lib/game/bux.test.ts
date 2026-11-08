import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLUBS } from './clubs';
import {
  BUX_CATALOG, BUX_DAILY_CAP, BUX_GOALS, FREE_CLUBS, activeBuffs, brDay, buffEffect, claimGoal, clubPrice, clubUnlockId, emptyProgress, goalKey,
  goalProgress, isClubAvailable, newWallet, purchase, startBuff, trackMatch, trackSeason, walletIntegrity, type BuxWallet,
} from './bux';

const DAY = '2026-11-05';
const key = (n: number) => `compra-${String(n).padStart(4, '0')}`;
/** Carteira com Bux suficiente: metas em vários dias (20 por dia). */
const rich = (days = 10): BuxWallet => {
  let w = newWallet();
  for (let d = 1; d <= days; d++) for (const g of ['goal_season', 'goal_win_10']) w = claimGoal(w, g, `2026-12-${String(d).padStart(2, '0')}`).wallet;
  return w;
};

describe('Bux · clubes: preços por força', () => {
  const paid = CLUBS.filter(c => !FREE_CLUBS.includes(c.id));
  it('os 4 mais fracos são grátis e os outros 16 são pagos', () => {
    expect(FREE_CLUBS).toHaveLength(4); expect(paid).toHaveLength(CLUBS.length - 4);
    const weakest = Math.max(...CLUBS.filter(c => FREE_CLUBS.includes(c.id)).map(c => c.rating));
    for (const c of paid) expect(c.rating).toBeGreaterThanOrEqual(weakest);
    expect(FREE_CLUBS).toEqual(expect.arrayContaining(['juventude', 'sport']));
  });
  it('preço vai de 5 (mais fraco pago) a 100 (mais forte) e nunca cai com a força', () => {
    const prices = paid.map(c => ({ r: c.rating, p: clubPrice(c.rating) }));
    expect(Math.min(...prices.map(x => x.p))).toBe(5); expect(Math.max(...prices.map(x => x.p))).toBe(100);
    expect(clubPrice(CLUBS.find(c => c.id === 'palmeiras')!.rating)).toBe(100);
    for (const a of prices) for (const b of prices) if (a.r < b.r) expect(a.p).toBeLessThanOrEqual(b.p);
    for (const { p } of prices) { expect(p).toBeGreaterThanOrEqual(5); expect(p).toBeLessThanOrEqual(100); expect(p % 5).toBe(0); }
  });
  it('o catálogo tem um item de desbloqueio para cada clube pago e nenhum para os grátis', () => {
    const unlocks = BUX_CATALOG.filter(i => i.kind === 'club_unlock');
    expect(unlocks.map(i => i.clubId).sort()).toEqual(paid.map(c => c.id).sort());
    for (const id of FREE_CLUBS) expect(BUX_CATALOG.some(i => i.id === clubUnlockId(id))).toBe(false);
  });
  it('clube grátis está sempre disponível; pago só depois da compra', () => {
    expect(isClubAvailable([], 'sport')).toBe(true); expect(isClubAvailable([], 'flamengo')).toBe(false);
    expect(isClubAvailable(['club_flamengo'], 'flamengo')).toBe(true);
  });
});

describe('Bux · carteira, metas e compras', () => {
  it('começa com zero e não compra sem saldo', () => {
    const r = purchase(newWallet(), 'energy_basic', key(1), DAY);
    expect(r.error).toBe('insufficient_funds'); expect(r.wallet.balance).toBe(0);
  });
  it('meta credita o valor do catálogo e a compra debita o preço do catálogo', () => {
    let w = claimGoal(newWallet(), 'goal_season', DAY).wallet; expect(w.balance).toBe(10);
    w = claimGoal(w, 'goal_win_10', DAY).wallet; expect(w.balance).toBe(15);
    const r = purchase(w, 'energy_basic', key(2), DAY);
    expect(r.error).toBeUndefined(); expect(r.wallet.balance).toBe(5);
    expect(walletIntegrity(r.wallet)).toEqual([]);
  });
  it('a mesma meta no mesmo dia paga uma vez; no dia seguinte paga de novo', () => {
    const w = claimGoal(newWallet(), 'goal_win_10', DAY).wallet;
    const again = claimGoal(w, 'goal_win_10', DAY);
    expect(again.duplicate).toBe(true); expect(again.wallet.balance).toBe(5);
    expect(claimGoal(w, 'goal_win_10', '2026-11-06').wallet.balance).toBe(10);
  });
  it('teto de 20 Bux por dia nas metas; o dia seguinte libera de novo', () => {
    let w = newWallet();
    for (const g of ['goal_season', 'goal_win_10', 'goal_cup_win']) w = claimGoal(w, g, DAY).wallet; // 10+5+4 = 19
    expect(w.balance).toBe(19);
    const over = claimGoal(w, 'goal_play_5', DAY); // +3 = 22 > 20
    expect(over.error).toBe('daily_cap'); expect(over.wallet.balance).toBe(19);
    expect(claimGoal(w, 'goal_play_5', '2026-11-06').error).toBeUndefined();
    const all = BUX_GOALS.reduce((s, g) => s + g.amount, 0); expect(all).toBeGreaterThan(BUX_DAILY_CAP); // o teto realmente limita
  });
  it('a chave da meta tem de ser a de hoje (não dá para resgatar data inventada)', () => {
    expect(goalKey('goal_season', DAY)).toBe('goal:goal_season:2026-11-05');
    const w = newWallet();
    expect(purchase(w, 'goal_season', goalKey('goal_season', DAY), DAY).error).toBe('wrong_operation');
  });
  it('repetir a mesma chave de compra (clique duplo, nova tentativa de rede) não cobra duas vezes', () => {
    const w = rich(1);
    const first = purchase(w, 'energy_basic', key(3), DAY).wallet;
    const again = purchase(first, 'energy_basic', key(3), DAY);
    expect(again.duplicate).toBe(true); expect(again.wallet).toBe(first); expect(again.wallet.balance).toBe(5);
  });
  it('mesma chave para outro item é recusada', () => {
    const first = purchase(rich(1), 'energy_basic', key(4), DAY).wallet;
    expect(purchase(first, 'medical_basic', key(4), DAY).error).toBe('key_reused');
  });
  it('rejeita item inexistente, operação trocada, recompensa antiga e chave inválida', () => {
    const w = rich(1);
    expect(purchase(w, 'nao_existe', key(5), DAY).error).toBe('unknown_item');
    expect(purchase(w, 'reward_welcome', key(5), DAY).error).toBe('unknown_item');
    expect(claimGoal(w, 'energy_basic', DAY).error).toBe('wrong_operation');
    expect(purchase(w, 'energy_basic', 'curta', DAY).error).toBe('invalid_key');
  });
  it('clube só pode ser desbloqueado uma vez e passa a ficar disponível', () => {
    let w = rich(20); expect(isClubAvailable(w.unlocked, 'flamengo')).toBe(false);
    w = purchase(w, 'club_flamengo', key(6), DAY).wallet;
    expect(isClubAvailable(w.unlocked, 'flamengo')).toBe(true);
    const second = purchase(w, 'club_flamengo', key(7), DAY);
    expect(second.error).toBe('already_unlocked'); expect(second.wallet.balance).toBe(w.balance);
    expect(walletIntegrity(w)).toEqual([]);
  });
  it('detecta saldo, histórico ou desbloqueios adulterados', () => {
    const w = purchase(rich(20), 'club_botafogo', key(8), DAY).wallet;
    expect(walletIntegrity(w)).toEqual([]);
    expect(walletIntegrity({ ...w, balance: w.balance + 1000 })).not.toEqual([]);
    expect(walletIntegrity({ ...w, unlocked: [...w.unlocked, 'club_palmeiras'] })).not.toEqual([]);
    expect(walletIntegrity({ ...w, tx: w.tx.map((t, i) => i === 0 ? { ...t, amount: t.amount + 500 } : t) })).not.toEqual([]);
    expect(walletIntegrity({ ...w, tx: [...w.tx, w.tx[0]!] })).not.toEqual([]);
  });
  it('sobrevive a JSON sem mudar', () => {
    const w = purchase(rich(20), 'medical_pro', key(9), DAY).wallet;
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
  });
});

describe('Bux · progresso das metas diárias', () => {
  it('conta partidas, vitórias, copa, gols e jogos sem sofrer gol', () => {
    let p = trackMatch(undefined, DAY, { my: 2, opp: 0, cup: false });
    p = trackMatch(p, DAY, { my: 1, opp: 1, cup: false });
    p = trackMatch(p, DAY, { my: 3, opp: 1, cup: true });
    expect(p).toEqual({ day: DAY, played: 3, wins: 2, cupWins: 1, goals: 6, cleanSheets: 1, seasons: 0 });
  });
  it('muda o dia, zera o progresso', () => {
    const p = trackMatch(undefined, DAY, { my: 1, opp: 0, cup: false });
    expect(trackMatch(p, '2026-11-06', { my: 0, opp: 2, cup: false })).toEqual({ ...emptyProgress('2026-11-06'), played: 1, goals: 0 });
    expect(trackSeason(p, '2026-11-06').seasons).toBe(1); expect(trackSeason(p, '2026-11-06').played).toBe(0);
  });
  it('não altera o objeto original', () => {
    const p = trackMatch(undefined, DAY, { my: 1, opp: 0, cup: false }), copy = structuredClone(p);
    trackMatch(p, DAY, { my: 5, opp: 0, cup: true }); trackSeason(p, DAY);
    expect(p).toEqual(copy);
  });
  it('meta concluída só quando o alvo é atingido; progresso de outro dia não vale', () => {
    const win10 = BUX_GOALS.find(g => g.id === 'goal_win_10')!;
    let p = emptyProgress(DAY); p = { ...p, wins: 9 };
    expect(goalProgress(win10, p, DAY)).toEqual({ value: 9, target: 10, done: false });
    expect(goalProgress(win10, { ...p, wins: 12 }, DAY)).toEqual({ value: 10, target: 10, done: true });
    expect(goalProgress(win10, { ...p, wins: 12 }, '2026-11-06').done).toBe(false);
    expect(goalProgress(win10, undefined, DAY).done).toBe(false);
  });
  it('brDay devolve a data no fuso de Brasília', () => {
    expect(brDay(new Date('2026-11-06T02:30:00Z'))).toBe('2026-11-05'); // ainda é dia 5 em Brasília (23:30)
    expect(brDay(new Date('2026-11-06T04:00:00Z'))).toBe('2026-11-06');
  });
});

describe('Bux · buffs de energia e médicos', () => {
  it('sem buff nada muda; com buff vale só durante a validade', () => {
    expect(buffEffect([], DAY)).toEqual({ energyDrainMult: 1, halftimeEnergyBonus: 0, injuryChanceMult: 1, recoveryDaysMult: 1 });
    const b = startBuff([], 'energy_basic', DAY); expect(b).toEqual([{ itemId: 'energy_basic', until: '2026-11-12' }]);
    expect(buffEffect(b, '2026-11-12').energyDrainMult).toBe(0.85); expect(buffEffect(b, '2026-11-13').energyDrainMult).toBe(1);
    expect(activeBuffs(b, '2026-11-13')).toHaveLength(0);
  });
  it('comprar de novo estende a validade em vez de reiniciar', () => {
    const once = startBuff([], 'medical_basic', DAY), twice = startBuff(once, 'medical_basic', '2026-11-10');
    expect(once[0]?.until).toBe('2026-11-19');
    expect(twice).toEqual([{ itemId: 'medical_basic', until: '2026-12-03' }]);
  });
  it('vale o efeito mais forte, sem acumular acima do previsto', () => {
    let b = startBuff([], 'energy_basic', DAY); b = startBuff(b, 'energy_pro', DAY); b = startBuff(b, 'medical_pro', DAY); b = startBuff(b, 'medical_basic', DAY);
    expect(buffEffect(b, DAY)).toEqual({ energyDrainMult: 0.7, halftimeEnergyBonus: 6, injuryChanceMult: 0.6, recoveryDaysMult: 0.7 });
  });
  it('ignora item que não é buff', () => { expect(startBuff([], 'club_flamengo', DAY)).toEqual([]); });
});

describe('Bux · catálogo e consistência com o SQL', () => {
  const dir = resolve(__dirname, '../../../drizzle/migrations');
  const file = readdirSync(dir).find(f => f.includes('bux_economia'));
  const sql = file ? readFileSync(resolve(dir, file), 'utf8') : '';
  const rows = [...sql.matchAll(/^\('([a-z0-9_]+)','([a-z_]+)','([^']+)',(\d+),(NULL|\d+),(NULL|'[a-z-]+')\)[,;]?$/gm)]
    .map(m => ({ id: m[1]!, kind: m[2]!, name: m[3]!, amount: Number(m[4]), duration: m[5] === 'NULL' ? undefined : Number(m[5]), club: m[6] === 'NULL' ? undefined : m[6]!.slice(1, -1) }));

  it('a migração da economia existe', () => { expect(file).toBeDefined(); });
  it('o catálogo do SQL é idêntico ao do TypeScript (ids, tipos, preços, prazos, clubes)', () => {
    expect(rows).toHaveLength(BUX_CATALOG.length);
    expect(rows).toEqual(BUX_CATALOG.map(i => ({ id: i.id, kind: i.kind, name: i.name, amount: i.amount, duration: i.durationDays, club: i.clubId })));
  });
  it('o limite diário e o fuso são os mesmos nos dois lados', () => {
    expect(sql).toContain(`v_earned + v_item.amount > ${BUX_DAILY_CAP}`);
    expect(sql).toContain("'America/Sao_Paulo'");
    expect(sql).toContain("p_key <> 'goal:' || p_item || ':' || v_today");
  });
  it('a migração não apaga carteiras, transações nem desbloqueios', () => {
    expect(sql).not.toMatch(/DELETE\s+FROM|DROP\s+TABLE|TRUNCATE/i);
    expect(sql).toContain('UPDATE public.bux_catalog SET active = false;');
  });
  it('todo item tem valor positivo e buffs têm prazo e efeito; metas têm alvo', () => {
    for (const i of BUX_CATALOG) {
      expect(i.amount).toBeGreaterThan(0);
      if (i.kind.endsWith('_buff')) { expect(i.durationDays).toBeGreaterThan(0); expect(i.effect).toBeDefined(); }
      if (i.kind === 'goal') expect(i.goal?.target).toBeGreaterThan(0);
    }
  });
  it('SQL: cliente só lê; escrita só pelas funções; função interna não é chamável', () => {
    const base = readFileSync(resolve(dir, '0003_bux.sql'), 'utf8');
    expect(base).not.toMatch(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/);
    expect(base).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*TO authenticated/);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.bux_apply(text, text, boolean) FROM PUBLIC, anon, authenticated;');
    for (const t of ['bux_catalog', 'bux_wallets', 'bux_transactions', 'bux_unlocks']) expect(base).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
    expect(sql).toContain('FOR UPDATE;'); expect(base).toContain('UNIQUE (user_id, idempotency_key)'); expect(base).toContain('CHECK (balance >= 0)');
  });
});
