import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCareer, completeRound, advanceToMatch, buyPlayer, type CareerV2 } from "./career";
import { initializeSeason } from "./seasons";
import { decodeCareer, isEncoded, SAVE_FORMAT_COMPACT } from "./career-codec";

// Salvamento com os elencos dos outros clubes compactados (etapa 5): grava, fecha, reabre e confere.
const db = vi.hoisted(() => ({ rows: [] as any[], writes: [] as any[], failure: false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({
  select: () => ({ eq: (_column: string, id: string) => ({ order: async () => ({ data: db.rows.filter(r => r.user_id === id), error: db.failure ? new Error("offline") : null }) }) }),
  upsert: (row: any) => ({ select: () => ({ single: async () => {
    db.writes.push(structuredClone(row));
    if (db.failure) return { data: null, error: new Error("offline") };
    db.rows = [row, ...db.rows.filter(r => r.id !== row.id)];
    return { data: { id: row.id }, error: null };
  } }) }),
}) } }));
async function storage() { return import("./storage"); }
beforeEach(() => { vi.resetModules(); localStorage.clear(); db.rows = []; db.writes = []; db.failure = false; });

/** Carreira com elencos dos outros clubes (temporada inicializada) e algumas jogadas feitas. */
function withSquads(): CareerV2 {
  let c = initializeSeason(createCareer("Compacto", "flamengo"));
  for (let i = 0; i < 3; i++) c = completeRound(advanceToMatch(c), 2, 0);
  const p = c.market.find(x => x.clubId !== "livre");
  if (p) c = buyPlayer({ ...c, balance: 900_000_000 }, p.id).career;
  return c;
}
const size = (o: unknown) => JSON.stringify(o).length;

describe("Salvamento compacto", () => {
  it("grava os elencos dos outros clubes como diferença, menor que o formato clássico, e reabre idêntico (nuvem, sem cache local)", async () => {
    const c = withSquads(); expect(Object.keys(c.otherSquads ?? {}).length).toBeGreaterThan(10);
    const s = await storage(); const id = await s.saveCareer("owner", null, c);
    const stored = db.rows[0].data;
    expect(isEncoded(stored)).toBe(true); expect(stored.saveFormat).toBe(SAVE_FORMAT_COMPACT); expect(stored.otherSquads).toBeUndefined();
    expect(size(stored)).toBeLessThan(size(c));
    localStorage.clear(); vi.resetModules();
    expect(await (await storage()).loadCareer("owner")).toEqual({ career: c, rowId: id });
  });
  it("convidado: grava compacto no aparelho e reabre idêntico", async () => {
    const c = withSquads(); const s = await storage(); await s.saveCareer(null, null, c);
    expect(isEncoded(JSON.parse(localStorage.getItem("ccw-career-v2") ?? "null"))).toBe(true);
    vi.resetModules(); expect((await (await storage()).loadCareer(null)).career).toEqual(c);
  });
  it("na primeira conversão guarda uma cópia do save clássico original; nunca a sobrescreve depois", async () => {
    const c = withSquads();
    db.rows = [{ id: "row", user_id: "owner", data: c, updated_at: "2026-01-01" }]; // save clássico na nuvem
    const s = await storage(); const loaded = await s.loadCareer("owner");
    expect(loaded.career).toEqual(c);
    await s.saveCareer("owner", loaded.rowId, { ...c, formation: "4-4-2" });
    const copy = localStorage.getItem("ccw-career-v2:owner:original"); expect(copy).not.toBeNull();
    expect(JSON.parse(copy!).career).toEqual(c); // exatamente o save clássico de antes
    expect(isEncoded(db.rows[0].data)).toBe(true);
    await s.saveCareer("owner", loaded.rowId, { ...c, formation: "5-3-2" });
    expect(localStorage.getItem("ccw-career-v2:owner:original")).toBe(copy);
  });
  it("é idempotente: abrir e salvar de novo não muda nada além do pedido", async () => {
    const c = withSquads(); const s = await storage(); await s.saveCareer("owner", null, c);
    const first = JSON.stringify(db.rows[0].data);
    vi.resetModules(); const s2 = await storage(); const re = await s2.loadCareer("owner");
    await s2.saveCareer("owner", re.rowId, re.career as CareerV2);
    expect(JSON.stringify(db.rows[0].data)).toBe(first); expect(re.career).toEqual(c);
    expect(db.rows).toHaveLength(1);
  });
  it("formato desconhecido ou base alterada: recusa abrir, mostra falha e NÃO grava nem apaga nada", async () => {
    const c = withSquads(); const s = await storage(); await s.saveCareer("owner", null, c);
    const good = structuredClone(db.rows[0].data); const writes = db.writes.length;
    for (const tamper of [(d: any) => { d.saveFormat = 99; }, (d: any) => { d.playerStore.baseFingerprint = "0000000000000000"; }, (d: any) => { delete d.playerStore; }]) {
      const bad = structuredClone(good); tamper(bad); db.rows = [{ ...db.rows[0], data: bad }]; localStorage.clear(); vi.resetModules();
      await expect((await storage()).loadCareer("owner")).rejects.toThrow();
      expect(db.rows[0].data).toEqual(bad); expect(db.writes.length).toBe(writes); expect(localStorage.length).toBe(0);
    }
  });
  it("jogador sem base e jogador transferido continuam guardados e voltam iguais", async () => {
    const c = withSquads();
    const [clubId, squad] = Object.entries(c.otherSquads!)[0]!;
    squad.push({ id: `${clubId}-api-777`, apiId: 777, clubId, name: "Jogador de Teste da API", pos: "MEI", age: 24, rating: 70, value: 1, wage: 1, real: true, contractUntil: "2028-01-01" });
    const s = await storage(); await s.saveCareer("owner", null, c);
    localStorage.clear(); vi.resetModules();
    const back = (await (await storage()).loadCareer("owner")).career!;
    expect(back).toEqual(c); expect(back.otherSquads?.[clubId]?.some(p => p.apiId === 777)).toBe(true);
  });
  it("se já existia um save que não deu para ler, não arrisca: grava no formato clássico", async () => {
    const c = withSquads(); localStorage.setItem("ccw-career-v2", "{lixo"); // save anterior ilegível
    const s = await storage(); await s.saveCareer(null, null, c);
    const stored = JSON.parse(localStorage.getItem("ccw-career-v2") ?? "null");
    expect(isEncoded(stored)).toBe(false); expect(stored).toEqual(c);
  });
  it("a gravação compacta não altera a carreira em memória nem os dados de finanças e dívidas", async () => {
    const c = withSquads(); const before = structuredClone(c);
    const s = await storage(); await s.saveCareer("owner", null, c);
    expect(c).toEqual(before);
    const back = decodeCareer(db.rows[0].data);
    expect(back.balance).toBe(c.balance); expect(back.debt).toBe(c.debt); expect(back.finance).toEqual(c.finance); expect(back.ledger).toEqual(c.ledger); expect(back.sponsors).toEqual(c.sponsors); expect(back.stadium).toEqual(c.stadium);
  });
});
