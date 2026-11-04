import { describe, expect, it } from "vitest";
import { createCareer, ensureFields, type CareerV2 } from "./career";
import { MAX_SCOUTS, YOUTH_COMPETITIONS, academy, categoryFor, hireScout, overall, processAcademyDay, promoteYouth, promotionWage, scoutCandidates, signProspect } from "./academy";
import { finance, monthStatement } from "./finance";

const fresh = () => ensureFields(createCareer("Base", "flamengo"));
/** Runs only the academy routine on consecutive days (avoids match-day blocks). */
function days(c: CareerV2, n: number) { const next = structuredClone(c); for (let i = 0; i < n; i++) { const d = new Date(`${next.date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); next.date = d.toISOString().slice(0, 10); processAcademyDay(next); } return next; }

describe("Youth academy", () => {
  it("starts with simulated youth players placed by age group", () => {
    const a = academy(fresh());
    expect(a.players).toHaveLength(12);
    for (const y of a.players) { expect(y.status).toBe("simulado"); expect(y.category).toBe(categoryFor(y.age)); }
    expect(categoryFor(15)).toBe("Sub-15"); expect(categoryFor(17)).toBe("Sub-17"); expect(categoryFor(18)).toBe("Sub-20");
  });

  it("uses CBF competition names only for Sub-20 and Sub-17", () => {
    expect(YOUTH_COMPETITIONS["Sub-20"]).toEqual({ name: "Campeonato Brasileiro Sub-20", real: true });
    expect(YOUTH_COMPETITIONS["Sub-17"]).toEqual({ name: "Campeonato Brasileiro Sub-17", real: true });
    expect(YOUTH_COMPETITIONS["Sub-15"].real).toBe(false);
    expect(academy(fresh()).competitions.every((x) => x.resultsStatus === "simulado")).toBe(true);
  });

  it("trains weekly, raising attributes, playing youth rounds and charging the academy cost", () => {
    const c = fresh();
    const before = academy(c).players.reduce((s, y) => s + overall(y), 0);
    const later = days(c, 56);
    const a = academy(later);
    expect(a.players.reduce((s, y) => s + overall(y), 0)).toBeGreaterThan(before);
    expect(a.competitions[0]?.rounds).toBe(8);
    expect(Object.values(finance(later).months).some((m) => (m.categorias_base ?? 0) < 0)).toBe(true);
    expect(monthStatement(later, "2025-04").rows.categorias_base).toBeLessThan(0);
  });

  it("promotes only players aged 16+ into the professional squad", () => {
    const c = fresh();
    const young = academy(c).players.find((y) => y.age < 16)!;
    expect(promoteYouth(c, young.id).error).toMatch(/16 anos/);
    const ready = academy(c).players.find((y) => y.age >= 16)!;
    const r = promoteYouth(c, ready.id);
    expect(r.error).toBeUndefined();
    const p = r.career.squad.find((x) => x.name === ready.name && x.academy)!;
    expect(p.rating).toBe(overall(ready));
    expect(p.wage).toBe(promotionWage(overall(ready)));
    expect(academy(r.career).players.some((y) => y.id === ready.id)).toBe(false);
  });

  it("limits scouts to three and lets the club sign reported prospects", () => {
    let c = fresh();
    c.balance = 900_000_000;
    for (let w = 0; w < 4 && academy(c).scouts.length < MAX_SCOUTS; w++) {
      for (const s of scoutCandidates(c)) { const r = hireScout(c, s); if (!r.error) c = r.career; }
      c = days(c, 7);
    }
    expect(academy(c).scouts).toHaveLength(MAX_SCOUTS);
    expect(hireScout(c, { ...scoutCandidates(c)[0]!, id: "extra" }).error).toMatch(/Máximo/);
    c = days(c, 70);
    const p = academy(c).prospects[0]!;
    expect(p).toBeTruthy();
    const r = signProspect(c, p.id);
    expect(r.career.balance).toBe(c.balance - p.fee);
    expect(academy(r.career).players.some((y) => y.id === p.youth.id && y.origin === "olheiro")).toBe(true);
  });

  it("ages players at season change, releases over-20s and brings a new intake", () => {
    const c = fresh();
    const a = academy(c);
    const old = a.players.filter((y) => y.age === 20).length;
    const total = a.players.length;
    const next = structuredClone(c); next.season = "2026";
    processAcademyDay(next);
    const b = academy(next);
    expect(b.players.length).toBe(total - old + 4 + b.level);
    expect(b.players.every((y) => y.age <= 20 && y.category === categoryFor(y.age))).toBe(true);
    expect(b.archive.length).toBe(3);
  });

  it("adds an academy to old saves without changing the squad", () => {
    const c = createCareer("Antigo", "santos");
    delete c.academy;
    const migrated = ensureFields(c);
    expect(migrated.academy?.players.length).toBe(12);
    expect(migrated.squad.map((p) => p.id)).toEqual(c.squad.map((p) => p.id));
  });
});
