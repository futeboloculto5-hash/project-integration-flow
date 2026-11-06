import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLUBS } from './clubs';
import {
  BUX_CATALOG, BUX_DAILY_REWARD_CAP, BUX_LOCKED_CLUBS, activeBuffs, buffEffect, claimReward, isClubAvailable,
  newWallet, purchase, startBuff, walletIntegrity, type BuxWallet,
} from './bux';

const DAY = '2026-11-05';
const key = (n: number) => `compra-${String(n).padStart(4, '0')}`;
const funded = (...rewards: [string, string][]) => rewards.reduce((w, [id, scope]) => claimReward(w, id, scope, DAY).wallet, newWallet());
const rich = (): BuxWallet => {
  let w = claimReward(newWallet(), 'reward_welcome', 'x', DAY).wallet;
  for (let day = 1; day <= 8; day++) for (const [id, scope] of [['reward_cup_champion', `c:${day}`], ['reward_season_played', `s:${day}`]] as const) w = claimReward(w, id, scope, `2026-12-0${day}`).wallet;
  return w;
};

describe('Bux · carteira e compras', () => {
  it('começa com zero e não compra sem saldo', () => {
    const r = purchase(newWallet(), 'energy_basic', key(1), DAY);
    expect(r.error).toBe('insufficient_funds'); expect(r.wallet.balance).toBe(0);
  });
  it('recompensa credita o valor do catálogo e a compra debita o preço do catálogo', () => {
    let w = funded(['reward_welcome', 'account']); expect(w.balance).toBe(100);
    w = claimReward(w, 'reward_cup_champion', 'c1:2026', DAY).wallet; expect(w.balance).toBe(400);
    const r = purchase(w, 'energy_basic', key(2), DAY);
    expect(r.error).toBeUndefined(); expect(r.wallet.balance).toBe(280);
    expect(walletIntegrity(r.wallet)).toEqual([]);
  });
  it('repetir a mesma chave (clique duplo, nova tentativa de rede) não cobra duas vezes', () => {
    const w = funded(['reward_cup_champion', 'a']);
    const first = purchase(w, 'energy_basic', key(3), DAY).wallet;
    const again = purchase(first, 'energy_basic', key(3), DAY);
    expect(again.duplicate).toBe(true); expect(again.wallet).toBe(first); expect(again.wallet.balance).toBe(180);
  });
  it('mesma chave para outro item é recusada', () => {
    const w = funded(['reward_cup_champion', 'a']);
    const first = purchase(w, 'energy_basic', key(4), DAY).wallet;
    expect(purchase(first, 'medical_basic', key(4), DAY).error).toBe('key_reused');
  });
  it('recompensa repetida no mesmo escopo paga uma vez; boas-vindas é única por conta', () => {
    let w = claimReward(newWallet(), 'reward_first_win', 'c1:2026', DAY).wallet;
    const again = claimReward(w, 'reward_first_win', 'c1:2026', DAY);
    expect(again.duplicate).toBe(true); expect(again.wallet.balance).toBe(50);
    w = claimReward(again.wallet, 'reward_welcome', 'a', DAY).wallet;
    expect(claimReward(w, 'reward_welcome', 'b', DAY).duplicate).toBe(true); expect(w.balance).toBe(150);
  });
  it('limita o ganho diário de recompensas (escopos inventados não rendem infinito)', () => {
    let w = newWallet(); let granted = 0;
    for (let i = 0; i < 10; i++) { const r = claimReward(w, 'reward_cup_champion', `fake-${i}`, DAY); if (!r.error) granted += 300; w = r.wallet; }
    expect(granted).toBe(Math.floor(BUX_DAILY_REWARD_CAP / 300) * 300);
    expect(claimReward(w, 'reward_season_played', 'x', DAY).error).toBe('daily_cap');
    expect(claimReward(w, 'reward_season_played', 'x', '2026-11-06').error).toBeUndefined();
  });
  it('rejeita item inexistente, operação trocada e chave inválida', () => {
    const w = funded(['reward_cup_champion', 'a']);
    expect(purchase(w, 'nao_existe', key(5), DAY).error).toBe('unknown_item');
    expect(purchase(w, 'reward_welcome', key(5), DAY).error).toBe('wrong_operation');
    expect(claimReward(w, 'energy_basic', 's', DAY).error).toBe('wrong_operation');
    expect(purchase(w, 'energy_basic', 'curta', DAY).error).toBe('invalid_key');
  });
  it('clube só pode ser desbloqueado uma vez e passa a ficar disponível', () => {
    let w = rich(); expect(isClubAvailable(w, 'flamengo')).toBe(false); expect(isClubAvailable(w, 'bahia')).toBe(true);
    w = purchase(w, 'club_flamengo', key(6), DAY).wallet;
    expect(isClubAvailable(w, 'flamengo')).toBe(true);
    const second = purchase(w, 'club_flamengo', key(7), DAY);
    expect(second.error).toBe('already_unlocked'); expect(second.wallet.balance).toBe(w.balance);
    expect(walletIntegrity(w)).toEqual([]);
  });
  it('detecta saldo, histórico ou desbloqueios adulterados', () => {
    const w = purchase(rich(), 'club_botafogo', key(8), DAY).wallet;
    expect(walletIntegrity(w)).toEqual([]);
    expect(walletIntegrity({ ...w, balance: w.balance + 1000 })).not.toEqual([]);
    expect(walletIntegrity({ ...w, unlocked: [...w.unlocked, 'club_palmeiras'] })).not.toEqual([]);
    expect(walletIntegrity({ ...w, tx: w.tx.map((t, i) => i === 0 ? { ...t, amount: t.amount + 500 } : t) })).not.toEqual([]);
    expect(walletIntegrity({ ...w, tx: [...w.tx, w.tx[0]!] })).not.toEqual([]);
  });
  it('sobrevive a JSON sem mudar', () => {
    const w = purchase(rich(), 'medical_pro', key(9), DAY).wallet;
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
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
  const sql = readFileSync(resolve(__dirname, '../../../drizzle/migrations/0003_bux.sql'), 'utf8');
  const rows = [...sql.matchAll(/^\('([a-z_]+)','([a-z_]+)','([^']+)',(\d+),(NULL|\d+),(NULL|'[a-z-]+')\)[,;]$/gm)]
    .map(m => ({ id: m[1]!, kind: m[2]!, name: m[3]!, amount: Number(m[4]), duration: m[5] === 'NULL' ? undefined : Number(m[5]), club: m[6] === 'NULL' ? undefined : m[6]!.slice(1, -1) }));

  it('o catálogo do SQL é idêntico ao do TypeScript (ids, tipos, preços, prazos, clubes)', () => {
    expect(rows).toHaveLength(BUX_CATALOG.length);
    expect(rows).toEqual(BUX_CATALOG.map(i => ({ id: i.id, kind: i.kind, name: i.name, amount: i.amount, duration: i.durationDays, club: i.clubId })));
  });
  it('o limite diário é o mesmo nos dois lados', () => { expect(sql).toContain(`v_earned + v_item.amount > ${BUX_DAILY_REWARD_CAP}`); });
  it('clubes bloqueados existem no jogo e têm preço', () => {
    for (const id of BUX_LOCKED_CLUBS) expect(CLUBS.some(c => c.id === id)).toBe(true);
    expect(BUX_LOCKED_CLUBS).toHaveLength(3);
  });
  it('todo item tem valor positivo e buffs têm prazo e efeito', () => {
    for (const i of BUX_CATALOG) { expect(i.amount).toBeGreaterThan(0); if (i.kind.endsWith('_buff')) { expect(i.durationDays).toBeGreaterThan(0); expect(i.effect).toBeDefined(); } }
  });
  it('SQL: cliente só lê; escrita só pelas funções; função interna não é chamável', () => {
    expect(sql).not.toMatch(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/);
    expect(sql).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*TO authenticated/);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.bux_apply(text, text, boolean) FROM PUBLIC, anon, authenticated;');
    for (const t of ['bux_catalog', 'bux_wallets', 'bux_transactions', 'bux_unlocks']) expect(sql).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
    expect(sql).toContain('FOR UPDATE;'); expect(sql).toContain('UNIQUE (user_id, idempotency_key)'); expect(sql).toContain('CHECK (balance >= 0)');
  });
});
