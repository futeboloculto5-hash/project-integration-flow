import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createCareer, completeRound, computeTable, buyPlayer, payDebt, advanceToMatch } from "./career";
import { initializeSeason, recordFixture, simulateDue, seasonFinished, startNextSeason } from './seasons';
import { importWorldSquad, proposeDeal, renewContract } from './transfers';

const db = vi.hoisted(() => ({ rows: [] as any[], writes: [] as any[], failure: false, hold: null as null | (() => void) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({
  select: () => ({ eq: (_column: string, id: string) => ({ order: async () => ({ data: db.rows.filter(r => r.user_id === id), error: db.failure ? new Error("offline") : null }) }) }),
  upsert: (row: any) => ({ select: () => ({ single: async () => {
    db.writes.push(structuredClone(row));
    if (db.hold) await new Promise<void>(resolve => { db.hold = resolve; });
    if (db.failure) return { data: null, error: new Error("offline") };
    db.rows = [row, ...db.rows.filter(r => r.id !== row.id)];
    return { data: { id: row.id }, error: null };
  } }) }),
}) } }));
async function storage() { return import("./storage"); }
function snapshot() {
  let c = createCareer("Treinador persistente", "flamengo");
  c = completeRound(advanceToMatch(c), 3, 1);
  const p = c.market[0];
  if (p) c = buyPlayer({ ...c, balance: 900_000_000 }, p.id).career;
  c = payDebt(c, 1_000_000).career;
  c.stadium.ticketPrice = 75;
  return c;
}
beforeEach(() => { vi.resetModules(); localStorage.clear(); db.rows = []; db.writes = []; db.failure = false; db.hold = null; });
afterEach(() => { vi.useRealTimers(); });
describe("Career persistence", () => {
  it("immediately saves guest changes before awaiting and recovers every field after reload", async () => {
    const c = snapshot(); const s = await storage(); const promise = s.saveCareer(null, null, c);
    expect(JSON.parse(localStorage.getItem("ccw-career-v2") ?? "null")).toEqual(c);
    await promise; vi.resetModules();
    const loaded = (await (await storage()).loadCareer(null)).career;
    expect(loaded).toEqual(c);
    expect(loaded?.clubId).toBe("flamengo"); expect(loaded?.manager).toBe("Treinador persistente");
    expect(loaded?.fixtures.filter(f => f.hg != null)).toHaveLength(10);
    expect(loaded?.transferredIn).toHaveLength(1);
    expect(loaded?.stadium.ticketPrice).toBe(75);
    expect(computeTable(loaded?.fixtures ?? [])).toEqual(computeTable(c.fixtures));
  });
  it("recovers full cloud state on a fresh sign-in without local storage", async () => {
    const s = await storage(); const c = snapshot(); const id = await s.saveCareer("owner", null, c);
    localStorage.clear(); vi.resetModules();
    expect(await (await storage()).loadCareer("owner")).toEqual({ career: c, rowId: id });
  });
  it("preserves existing row identity and other careers", async () => {
    const c = snapshot(); const old = createCareer("Outro", "palmeiras");
    db.rows = [{ id: "existing", user_id: "owner", data: c, updated_at: "2025-01-01" }, { id: "untouched", user_id: "another", data: old, updated_at: "2025-01-01" }];
    const s = await storage(); const loaded = await s.loadCareer("owner");
    await s.saveCareer("owner", loaded.rowId, { ...c, formation: "4-4-2" });
    expect(db.rows.map(r => r.id).sort()).toEqual(["existing", "untouched"]);
    expect(db.rows.find(r => r.id === "untouched")?.data).toEqual(old);
  });
  it("serializes overlapping writes using one stable ID and the latest state", async () => {
    db.hold = () => {}; const s = await storage(); const c = snapshot();
    const first = s.saveCareer("owner", null, c);
    const latest = { ...c, balance: 123456, formation: "4-4-2" as const };
    const second = s.saveCareer("owner", null, latest);
    expect(db.writes).toHaveLength(1);
    const release = db.hold; db.hold = null; release?.();
    const [a,b] = await Promise.all([first,second]);
    expect(a).toBe(b); expect(db.rows).toHaveLength(1); expect(db.rows[0].data).toEqual(latest);
  });
  it("retries a failed cloud write automatically without losing the snapshot", async () => {
    vi.useFakeTimers(); db.failure = true; const s = await storage(); const c = snapshot();
    await expect(s.saveCareer("owner", null, c)).rejects.toThrow();
    expect(s.getSaveStatus("owner")).toBe("pending");
    expect(JSON.parse(localStorage.getItem("ccw-career-v2:owner") ?? "null").career).toEqual(c);
    db.failure = false; await vi.advanceTimersByTimeAsync(1100);
    expect(s.getSaveStatus("owner")).toBe("saved"); expect(db.rows[0].data).toEqual(c);
  });
  it("recovers an interrupted pending write after reload", async () => {
    const c = snapshot(); localStorage.setItem("ccw-career-v2:owner", JSON.stringify({career:c,rowId:"stable",updatedAt:"2026-10-17T00:00:00Z",dirty:true}));
    const s = await storage(); expect(await s.loadCareer("owner")).toEqual({career:c,rowId:"stable"});
    await s.retryCareerSave("owner"); expect(db.rows[0].data).toEqual(c);
  });
  it("never loads another account's backup or hides cloud load failure as a new career", async () => {
    const s = await storage(); await s.saveCareer("owner",null,snapshot()); db.failure = true;
    await expect(s.loadCareer("another")).rejects.toThrow("Career load unavailable");
  });
  it("retains guest career and does not replace an existing signed-in career", async () => {
    const s = await storage(); const guest = createCareer("Convidado","palmeiras"); const existing = snapshot();
    await s.saveCareer(null,null,guest); await s.saveCareer("owner",null,existing);
    expect((await s.loadCareer("owner")).career).toEqual(existing);
    expect((await s.loadCareer(null)).career).toEqual(guest);
  });
  it('recovers world clubs, negotiations, contracts, wages and transfer history from the cloud', async () => {
    let c = importWorldSquad(snapshot(), { apiId: 529, name: 'Barcelona', country: 'Spain', fetchedAt: '2026-10-19T00:00:00Z' }, Array.from({ length: 22 }, (_, i) => ({ id: 9000 + i, name: `API ${i}`, age: 25 })));
    const p = c.squad[0], q = c.market.find(x => x.apiId === 9000);
    if (!p || !q) throw Error('missing test player');
    c = renewContract(c, p.id, p.wage + 1000, 36).career;
    c = proposeDeal(c, q.id, { kind: 'loan', fee: 100_000, wage: q.wage, months: 6 }).career;
    c.aiBalances = { 'world-529': 98_000_000 };
    c.loans = [{ playerId: 'legacy-loan', owner: 'world-529', borrower: c.clubId, until: '2025-08-01', originalWage: 50000 }];
    const s = await storage(); await s.saveCareer('owner', null, c); localStorage.clear(); vi.resetModules();
    const restored = (await (await storage()).loadCareer('owner')).career;
    expect(restored).toEqual(c);
    expect(restored?.negotiations?.[0]?.kind).toBe('loan');
    expect(restored?.transferHistory?.[0]?.kind).toBe('renew');
    expect(restored?.aiBalances?.['world-529']).toBe(98_000_000);
    expect(restored?.loans?.[0]?.until).toBe('2025-08-01');
  });
  it('persists promotion, archives, knockout results and player development across a fresh sign-in', async () => {
    let c = initializeSeason(createCareer('Temporadas', 'flamengo'));
    for (const f of c.fixtures) recordFixture(c, f, 2, 1);
    for (let i=0;i<4;i++) { for (const f of c.seasonState?.cup ?? []) recordFixture(c,f,1,1); simulateDue(c,'2026-12-31'); }
    expect(seasonFinished(c)).toBe(true);
    c = startNextSeason(c).career;
    const s = await storage(); const id = await s.saveCareer('owner',null,c); localStorage.clear(); vi.resetModules();
    const restored = await (await storage()).loadCareer('owner');
    expect(restored.rowId).toBe(id); expect(restored.career).toEqual(c);
    expect(restored.career?.season).toBe('2026');
    expect(restored.career?.seasonState?.history[0]?.relegated).toHaveLength(4);
    expect(restored.career?.seasonState?.history[0]?.cup).toHaveLength(15);
  });
});
