import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ cached: null as any, reservation: 'ok', dbError: false, updates: [] as any[] }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {
  rpc: async () => ({ data: state.reservation, error: state.dbError ? Error('unavailable') : null }),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.cached, error: state.dbError ? Error('unavailable') : null }) }) }), update: (v: any) => ({ eq: async () => { state.updates.push(v); return { error: null }; } }) }),
} }));
import { footballRead } from './football-api.server';
beforeEach(() => { vi.stubEnv('API_FOOTBALL_KEY', 'test-only-not-a-real-secret'); vi.stubGlobal('fetch', vi.fn()); state.cached = null; state.reservation = 'ok'; state.dbError = false; state.updates = []; });
describe('API coverage and quota protection', () => {
  it('serves a seven-day shared cache without spending an upstream request', async () => {
    state.cached = { payload: { response: [{ team: { id: 529 } }] }, fetched_at: new Date().toISOString() };
    expect((await footballRead('teams', { search: 'Barcelona' })).cached).toBe(true); expect(fetch).not.toHaveBeenCalled();
  });
  it('never calls the provider when the shared quota is exhausted', async () => {
    state.reservation = 'quota'; await expect(footballRead('teams', { search: 'Barcelona' })).rejects.toThrow('Limite preventivo'); expect(fetch).not.toHaveBeenCalled();
  });
  it('fails closed if the quota store is unavailable', async () => {
    state.dbError = true; await expect(footballRead('teams', { search: 'Barcelona' })).rejects.toThrow('limite'); expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects API errors inside successful HTTP responses without inventing players or retrying', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ errors: { plan: 'Unavailable season' }, response: [] }));
    await expect(footballRead('players', { season: '2025', team: '529' })).rejects.toThrow('cobertura'); expect(fetch).toHaveBeenCalledTimes(1);
    expect(state.updates.some(x => x.payload)).toBe(false);
  });
  it('keeps stale identities available when refresh is blocked by quota', async () => {
    state.reservation = 'quota'; state.cached = { payload: { response: [{ team: { id: 529 } }] }, fetched_at: '2020-01-01T00:00:00Z' };
    const r = await footballRead('teams', { search: 'Barcelona' }); expect(r.stale).toBe(true); expect(r.fetchedAt).toBe('2020-01-01T00:00:00Z'); expect(fetch).not.toHaveBeenCalled();
  });
});