import { describe, expect, it } from 'vitest';
import { WELCOME_KEY } from './bux';
import { buxClaimWelcome, buxPurchase, loadBuxAccount, type BuxClient } from './bux-storage';

type Res = { data?: unknown; error?: { message: string } | null };
const rows = (result: Res) => { const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: () => Promise.resolve(result), then: (a: any, b: any) => Promise.resolve(result).then(a, b) }; return q; };
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
    const { c, calls } = client({ rpc: () => ({ data: { ok: true, duplicate: false, balance: 180 } }) });
    expect(await buxPurchase(c, 'energy_basic', 'buy:energy_basic:abc')).toEqual({ ok: true, duplicate: false, balance: 180 });
    expect(calls).toEqual([{ fn: 'bux_purchase', args: { p_item: 'energy_basic', p_key: 'buy:energy_basic:abc' } }]);
  });
  it('repetir a mesma chave manda a mesma chave e aceita o aviso de duplicada', async () => {
    const { c, calls } = client({ rpc: () => ({ data: { ok: true, duplicate: true, balance: 180 } }) });
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
  it('boas-vindas usa sempre a chave fixa da conta', async () => {
    const { c, calls } = client();
    await buxClaimWelcome(c);
    expect(calls[0]).toEqual({ fn: 'bux_claim_reward', args: { p_item: 'reward_welcome', p_key: WELCOME_KEY } });
  });
  it('carrega a conta: saldo, clubes, histórico e se as boas-vindas já foram resgatadas', async () => {
    const { c } = client({ tables: {
      bux_wallets: { data: { balance: 280 }, error: null },
      bux_unlocks: { data: [{ item_id: 'club_flamengo' }], error: null },
      bux_transactions: { data: [{ idempotency_key: 'k1', kind: 'purchase', item_id: 'energy_basic', amount: -120, balance_after: 280, created_at: '2026-11-05T10:00:00Z', id: 'x' }], error: null },
    } });
    const a = await loadBuxAccount(c, 'user-1');
    expect(a.balance).toBe(280); expect(a.unlocked).toEqual(['club_flamengo']); expect(a.welcomeClaimed).toBe(true);
    expect(a.recent).toEqual([{ key: 'k1', kind: 'purchase', item: 'energy_basic', amount: -120, balanceAfter: 280, day: '2026-11-05' }]);
  });
  it('conta nova (sem carteira) começa com zero; erro de leitura é reportado, não escondido', async () => {
    const empty = await loadBuxAccount(client({ tables: { bux_wallets: { data: null, error: null } } }).c, 'user-1');
    expect(empty).toEqual({ balance: 0, unlocked: [], welcomeClaimed: false, recent: [] });
    await expect(loadBuxAccount(client({ tables: { bux_wallets: { error: { message: 'x' } } } }).c, 'user-1')).rejects.toThrow('bux_load');
  });
});
