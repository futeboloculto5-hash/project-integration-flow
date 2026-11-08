// Dados da CARREIRA sobre os dados-base (datapack, etapa 4).
// Em vez de copiar cada jogador inteiro no save, guarda só o que mudou em relação à base (clube, contrato, salário, idade, nota...).
// Jogador sem base (vindo da API, agente livre gerado) continua guardado por inteiro: nada se perde.
// Estas funções são PURAS e ainda não são usadas pelo salvamento; o save atual não foi alterado.
import { toGamePlayer, type PlayerProvider } from "./player-provider";
import type { CareerV2, Player } from "./career";

export type PlayerEntry =
  /** Há base: o próprio `id` aponta para ela (estável ou legado) e só a diferença é guardada. */
  | { id: string; set?: Record<string, unknown>; unset?: string[] }
  /** Sem base: o jogador fica guardado por inteiro. */
  | { id: string; full: Player };

type Rec = Record<string, unknown>;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Guarda só a diferença para a base; sem base, guarda o jogador inteiro. */
export function compactPlayer(p: Player, provider: PlayerProvider): PlayerEntry {
  const base = provider.find(p.id);
  if (!base) return { id: p.id, full: structuredClone(p) };
  const b = toGamePlayer(base) as unknown as Rec, cur = p as unknown as Rec;
  const set: Rec = {}, unset: string[] = [];
  for (const k of Object.keys(cur)) if (cur[k] !== undefined && !same(cur[k], b[k])) set[k] = structuredClone(cur[k]);
  for (const k of Object.keys(b)) if (cur[k] === undefined) unset.push(k);
  return { id: p.id, ...(Object.keys(set).length ? { set } : {}), ...(unset.length ? { unset } : {}) };
}

/** Reconstrói o jogador completo. `null` se a base não existe mais (quem chama deve tratar, nunca descartar o jogador). */
export function expandPlayer(e: PlayerEntry, provider: PlayerProvider): Player | null {
  if ("full" in e) return structuredClone(e.full);
  const base = provider.find(e.id);
  if (!base) return null;
  const out = { ...(toGamePlayer(base) as unknown as Rec), ...(e.set ? structuredClone(e.set) : {}) };
  for (const k of e.unset ?? []) delete out[k];
  return out as unknown as Player;
}

/** Compacta e CONFERE: se reconstruir não devolver exatamente o mesmo jogador, guarda por inteiro. Nunca perde dado. */
export function compactVerified(p: Player, provider: PlayerProvider): PlayerEntry {
  const e = compactPlayer(p, provider);
  if ("full" in e) return e;
  const back = expandPlayer(e, provider);
  return back && same(sortKeys(back), sortKeys(p)) ? e : { id: p.id, full: structuredClone(p) };
}
const sortKeys = (o: unknown): unknown => (o && typeof o === "object" ? Object.fromEntries(Object.entries(o as Rec).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))) : o);

export const compactSquad = (players: readonly Player[], provider: PlayerProvider) => players.map((p) => compactVerified(p, provider));
/** Reconstrói uma lista; entradas sem base saem em `missing` (a migração deve parar e manter o save antigo se houver alguma). */
export function expandSquad(entries: readonly PlayerEntry[], provider: PlayerProvider): { players: Player[]; missing: string[] } {
  const players: Player[] = [], missing: string[] = [];
  for (const e of entries) { const p = expandPlayer(e, provider); if (p) players.push(p); else missing.push(e.id); }
  return { players, missing };
}

// ---------- análise de um save (somente leitura) ----------
export type PlayerGroupReport = { total: number; withBase: number; embedded: number; changedFields: Record<string, number>; fullBytes: number; compactBytes: number };
export type CareerPlayersReport = {
  groups: Record<"squad" | "market" | "otherSquads", PlayerGroupReport>;
  total: PlayerGroupReport;
  /** Referências por id (mercado, ofertas, negociações, empréstimos, histórico) que apontam para um jogador que o save ou a base conhece. */
  references: { total: number; resolvable: number; unknown: string[] };
  /** Tudo reconstruído de volta é idêntico ao original? */
  lossless: boolean;
};
const bytes = (o: unknown) => JSON.stringify(o).length;

/** Mostra quanto de um save é reconstruível a partir da base e quanto ocuparia compacto. Não altera nada. */
export function analyzeCareerPlayers(c: CareerV2, provider: PlayerProvider): CareerPlayersReport {
  const empty = (): PlayerGroupReport => ({ total: 0, withBase: 0, embedded: 0, changedFields: {}, fullBytes: 0, compactBytes: 0 });
  const groups = { squad: empty(), market: empty(), otherSquads: empty() };
  let lossless = true;
  const known = new Set<string>();
  const scan = (name: keyof typeof groups, players: readonly Player[]) => {
    const g = groups[name];
    for (const p of players) {
      known.add(p.id);
      const e = compactVerified(p, provider);
      g.total++; g.fullBytes += bytes(p); g.compactBytes += bytes(e);
      if ("full" in e) g.embedded++;
      else { g.withBase++; for (const k of Object.keys(e.set ?? {})) g.changedFields[k] = (g.changedFields[k] ?? 0) + 1; for (const k of e.unset ?? []) g.changedFields[`-${k}`] = (g.changedFields[`-${k}`] ?? 0) + 1; }
      const back = expandPlayer(e, provider);
      if (!back || !same(sortKeys(back), sortKeys(p))) lossless = false;
    }
  };
  scan("squad", c.squad); scan("market", c.market); scan("otherSquads", Object.values(c.otherSquads ?? {}).flat());
  const refs = [
    ...(c.offers ?? []).map((o) => o.playerId), ...(c.negotiations ?? []).map((n) => n.playerId), ...(c.loans ?? []).map((l) => l.playerId), ...(c.transferHistory ?? []).map((t) => t.playerId),
  ];
  const unknown = [...new Set(refs.filter((id) => !known.has(id) && !provider.has(id)))];
  const total = empty();
  for (const g of Object.values(groups)) { total.total += g.total; total.withBase += g.withBase; total.embedded += g.embedded; total.fullBytes += g.fullBytes; total.compactBytes += g.compactBytes; for (const [k, v] of Object.entries(g.changedFields)) total.changedFields[k] = (total.changedFields[k] ?? 0) + v; }
  return { groups, total, references: { total: refs.length, resolvable: refs.length - refs.filter((id) => !known.has(id) && !provider.has(id)).length, unknown }, lossless };
}
