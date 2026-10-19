import { describe, it, expect } from 'vitest';
import { addDays, advanceDay, createCareer, ensureFields } from './career';
import { acceptNegotiation, clubSquad, importWorldSquad, processMarketDay, proposeDeal, renewContract, transferPlayer } from './transfers';

function world() {
  const c = ensureFields(createCareer('Teste', 'flamengo'));
  return importWorldSquad(c, { apiId: 529, name: 'Barcelona', country: 'Spain', fetchedAt: '2026-10-19T00:00:00Z' }, Array.from({ length: 22 }, (_, i) => ({ id: 1000 + i, name: `API ${i}`, position: 'Midfielder', age: 24 })));
}
describe('Persistent world market rules', () => {
  it('imports only supplied API identities and never replaces the user squad', () => {
    const c = world(); expect(c.otherSquads?.['world-529']).toHaveLength(22);
    expect(c.otherSquads?.['world-529']?.[0]?.name).toBe('API 0');
    expect(importWorldSquad(c, { apiId: 127, name: 'Flamengo', country: 'Brazil', fetchedAt: null }, []).squad).toEqual(c.squad);
  });
  it('negotiates a purchase and moves ownership and both club balances', () => {
    const c = world(); const p = c.otherSquads?.['world-529']?.[0]; if (!p) throw Error('fixture');
    const terms = { kind: 'buy' as const, fee: Math.round(p.value * 1.1), wage: p.wage, months: 24 };
    const proposed = proposeDeal(c, p.id, terms).career;
    expect(proposed.negotiations?.[0]?.status).toBe('pending'); expect(proposed.balance).toBe(c.balance);
    const day = advanceDay(proposed).career;
    expect(day.negotiations?.[0]?.status).toBe('accepted');
    const result = acceptNegotiation(day, day.negotiations?.[0]?.id ?? ''); expect(result.error).toBeUndefined();
    expect(result.career.balance).toBe(day.balance - terms.fee);
    expect(result.career.aiBalances?.['world-529']).toBe(100_000_000 + terms.fee);
    expect(result.career.squad.find(x => x.id === p.id)?.contractUntil).toBe(addDays(day.date, 720));
    expect(clubSquad(result.career, 'world-529').some(x => x.id === p.id)).toBe(false);
    expect(result.career.transferHistory?.[0]?.kind).toBe('buy');
    const imported = importWorldSquad(result.career, { apiId: 529, name: 'Barcelona', country: 'Spain', fetchedAt: null }, [{ id: 1000, name: 'API 0' }]);
    expect(imported.squad.filter(x => x.apiId === 1000)).toHaveLength(1);
    expect(clubSquad(imported, 'world-529').some(x => x.apiId === 1000)).toBe(false);
  });
  it('credits a sale and inserts the player into the buying AI squad', () => {
    const c = world(), p = c.squad[0]; if (!p) throw Error('fixture');
    const r = transferPlayer(c, p.id, c.clubId, 'world-529', { kind: 'buy', fee: 500_000, wage: p.wage, months: 12 });
    expect(r.error).toBeUndefined(); expect(r.career.balance).toBe(c.balance + 500_000);
    expect(clubSquad(r.career, 'world-529').find(x => x.id === p.id)?.clubId).toBe('world-529');
  });
  it('returns loaned players automatically and restores their original wage', () => {
    const c = world(), p = c.squad[0]; if (!p) throw Error('fixture');
    const r = transferPlayer(c, p.id, c.clubId, 'world-529', { kind: 'loan', fee: 100_000, wage: p.wage + 1000, months: 1 });
    expect(r.error).toBeUndefined(); expect(r.career.loans?.[0]?.until).toBe(addDays(c.date, 30));
    expect(r.career.squad.some(x => x.id === p.id)).toBe(false);
    r.career.date = addDays(c.date, 30); processMarketDay(r.career);
    expect(r.career.squad.find(x => x.id === p.id)?.wage).toBe(p.wage);
    expect(r.career.loans).toHaveLength(0);
    expect(clubSquad(r.career, 'world-529').some(x => x.id === p.id)).toBe(false);
  });
  it('rejects invalid money, excessive loan duration and low salaries', () => {
    const c = world(), p = c.market.find(x => x.clubId === 'world-529'); if (!p) throw Error('fixture');
    expect(proposeDeal(c, p.id, { kind: 'buy', fee: NaN, wage: p.wage, months: 12 }).error).toBeTruthy();
    expect(proposeDeal(c, p.id, { kind: 'loan', fee: 0, wage: p.wage, months: 13 }).error).toBeTruthy();
    expect(transferPlayer(c, p.id, p.clubId, c.clubId, { kind: 'buy', fee: 0, wage: -1, months: 12 }).error).toBeTruthy();
  });
  it('preserves minimum and maximum squad sizes', () => {
    const c = world(); c.squad = c.squad.slice(0, 16); const p = c.squad[0]; if (!p) throw Error('fixture');
    expect(transferPlayer(c, p.id, c.clubId, 'world-529', { kind: 'buy', fee: 0, wage: p.wage, months: 12 }).error).toContain('16');
    const q = clubSquad(c, 'world-529')[0]; if (!q) throw Error('fixture');
    c.squad = Array.from({ length: 32 }, (_, i) => ({ ...p, id: `test-${i}` }));
    expect(transferPlayer(c, q.id, 'world-529', c.clubId, { kind: 'buy', fee: 0, wage: q.wage, months: 12 }).error).toContain('32');
  });
  it('renews contract and wages without changing club or manager', () => {
    const c = world(), p = c.squad[0]; if (!p) throw Error('fixture');
    const r = renewContract(c, p.id, p.wage + 1000, 36);
    expect(r.career.squad[0]?.wage).toBe(p.wage + 1000); expect(r.career.squad[0]?.contractUntil).toBe(addDays(c.date, 1080));
    expect(r.career.manager).toBe('Teste'); expect(r.career.clubId).toBe('flamengo');
  });
  it('AI clubs negotiate with ownership changes without an external API call', () => {
    const c = world();
    for (let i = 0; i < 70; i++) { c.date = addDays(c.date, 1); processMarketDay(c); }
    expect(c.transferHistory?.some(x => x.ai && (x.kind === 'buy' || x.kind === 'loan'))).toBe(true);
  });
  it('preserves all added market fields through snapshot serialization', () => {
    const c = world(), p = c.squad[0]; if (!p) throw Error('fixture');
    const r = transferPlayer(c, p.id, c.clubId, 'world-529', { kind: 'loan', fee: 100_000, wage: p.wage, months: 6 }).career;
    expect(ensureFields(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });
});