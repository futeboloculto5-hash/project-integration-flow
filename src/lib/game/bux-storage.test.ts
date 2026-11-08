import { describe, expect, it } from 'vitest';
import { goalKey } from './bux';
import { buxClaimGoal, buxPurchase, loadBuxAccount, type BuxClient } from './bux-storage';

type Res = { data?: unknown; error?: { message: string } | null };
const rows = (result: Res) => { const q: any = { select: () => q, eq: () => q, like: () => q, order: () => q, limit: () => q, maybeSingle: () => Promise.resolve(result), then: (a: any, b: any) => Promise.resolve(result).then(a, b) }; return q; };
function client(opts: { rpc?: (fn: string, args: any) => Res | Promise<Res>; tables?: Record<string, Res> } = {}) {
  const calls: { fn: string; args: any }[] = [];
  const c = {
    rpc: async (fn: string, args: any) => { calls.push({ fn, args }); return (await (opts.rpc?.(fn, args) ?? { data: { ok: true, duplicate: false, balance: 0 } })) as Res; },
    from: (t: string) => rows(opts.tables?.[t] ?? { data: [], error: null }),
  } as unknown as BuxClient;
  return { c, calls };
}

describe('Bux · acesso ao banco', () => {
  it('compra: devolve o saldo do servidor e envia item e chave', async () => {
    const { c, calls } = client({ rpc: () => ({ data: { ok: true, duplicate: false, balance: 18 } }) });
    expect(await buxPurchase(c, 'energy_basic', 'buy:energy_basic:abc')).toEqual({ ok: true, duplicate: false, balance: 18 });
    expect(calls).toEqual([{ fn: 'bux_purchase', args: { p_item: 'energy_basic', p_key: 'buy:energy_basic:abc' } }]);
  });
  it('repetir a mesma chave manda a mesma chave e aceita o aviso de duplicada', async () => {
    const { c, calls } = client({ rpc: () => ({ data: { ok: true, duplicate: true, balance: 18 } }) });
    const first = await buxPurchase(c, 'energy_basic', 'buy:energy_basic:abc'), again = await buxPurchase(c, 'energy_basic', 'buy:energy_basic:abc');
    expect(first).toEqual(again); expect(again).toMatchObject({ ok: true, duplicate: true });
    expect(calls[0]?.args).toEqual(calls[1]?.args);
  });
  it('traduz erros do servidor em códigos conhecidos', async () => {
    for (const code of ['insufficient_funds', 'already_unlocked', 'daily_cap', 'key_reused', 'not_authenticated']) {
      const { c } = client({ rpc: () => ({ error: { message: code } }) });
      expect(await buxPurchase(c, 'energy_basic', 'chave-12345')).toEqual({ ok: false, error: code });
    }
  });
  it('queda de rede, exceção e resposta torta viram "network" (nada é cobrado)', async () => {
    expect(await buxPurchase(client({ rpc: () => ({ error: { message: 'TypeError: Failed to fetch' } }) }).c, 'energy_basic', 'chave-12345')).toEqual({ ok: false, error: 'network' });
    expect(await buxPurchase(client({ rpc: () => { throw new Error('boom'); } }).c, 'energy_basic', 'chave-12345')).toEqual({ ok: false, error: 'network' });
    expect(await buxPurchase(client({ rpc: () => ({ data: null }) }).c, 'energy_basic', 'chave-12345')).toEqual({ ok: false, error: 'network' });
    expect(await buxPurchase(client({ rpc: () => ({ data: { ok: true } }) }).c, 'energy_basic', 'chave-12345')).toEqual({ ok: false, error: 'network' });
  });
  it('meta usa a chave do dia e a função de recompensa', async () => {
    const { c, calls } = client({ rpc: () => ({ data: { ok: true, duplicate: false, balance: 10 } }) });
    expect(await buxClaimGoal(c, 'goal_season', '2026-11-07')).toEqual({ ok: true, duplicate: false, balance: 10 });
    expect(calls[0]).toEqual({ fn: 'bux_claim_reward', args: { p_item: 'goal_season', p_key: goalKey('goal_season', '2026-11-07') } });
  });
  it('limite diário vindo do servidor vira o código daily_cap', async () => {
    const { c } = client({ rpc: () => ({ error: { message: 'daily_cap' } }) });
    expect(await buxClaimGoal(c, 'goal_season', '2026-11-07')).toEqual({ ok: false, error: 'daily_cap' });
  });
  it('carrega a conta: saldo, clubes, histórico e o que já rendeu hoje', async () => {
    const { c } = client({ tables: {
      bux_wallets: { data: { balance: 28 }, error: null },
      bux_unlocks: { data: [{ item_id: 'club_flamengo' }], error: null },
      bux_transactions: { data: [{ idempotency_key: 'k1', kind: 'grant', item_id: 'goal_season', amount: 10, balance_after: 28, created_at: '2026-11-07T10:00:00Z', id: 'x' }], error: null },
    } });
    const a = await loadBuxAccount(c, 'user-1', '2026-11-07');
    expect(a.balance).toBe(28); expect(a.unlocked).toEqual(['club_flamengo']);
    expect(a.claimedToday).toEqual(['goal_season']); expect(a.earnedToday).toBe(10);
    expect(a.recent).toEqual([{ key: 'k1', kind: 'grant', item: 'goal_season', amount: 10, balanceAfter: 28, day: '2026-11-07' }]);
  });
  it('conta nova (sem carteira) começa com zero; erro de leitura é reportado, não escondido', async () => {
    const empty = await loadBuxAccount(client({ tables: { bux_wallets: { data: null, error: null } } }).c, 'user-1', '2026-11-07');
    expect(empty).toEqual({ balance: 0, unlocked: [], claimedToday: [], earnedToday: 0, recent: [] });
    await expect(loadBuxAccount(client({ tables: { bux_wallets: { error: { message: 'x' } } } }).c, 'user-1', '2026-11-07')).rejects.toThrow('bux_load');
  });
});
