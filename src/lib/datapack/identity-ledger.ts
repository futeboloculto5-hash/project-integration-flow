// Livro de identidade (etapa 7): registra, de forma serializável, quais jogadores e clubes cada pacote/versão já trouxe
// e quais ligações entre ids foram CONFIRMADAS por uma pessoa (ex.: o pacote renomeou "plr:a" para "plr:b").
// O livro nunca decide sozinho: ele só guarda o histórico e as ligações explícitas. Não mexe em dados de pacote nem de carreira.
import type { Datapack } from "./types";

export type LedgerSource = { packId: string; version: string };
export type LedgerKind = "plr" | "club";
export type LedgerEntity = {
  id: string;
  kind: LedgerKind;
  /** Nome mais recente. */
  name: string;
  /** Todos os nomes já vistos (histórico). */
  names: string[];
  birthDate?: string;
  nationalityId?: string;
  firstSeen: LedgerSource;
  /** Pacotes (e versão mais recente de cada) que já trouxeram esta entidade. */
  sources: LedgerSource[];
};
/** Ligação confirmada: o id `from` é o mesmo que `to`. Os dados de nenhum dos dois são alterados. */
export type IdLink = { from: string; to: string; kind: LedgerKind; note: string };
export type IdentityLedger = { format: 1; entities: Record<string, LedgerEntity>; links: IdLink[] };

export const createLedger = (): IdentityLedger => ({ format: 1, entities: {}, links: [] });

const kindOf = (id: string): LedgerKind | null => (id.startsWith("plr:") ? "plr" : id.startsWith("club:") ? "club" : null);

function touch(l: IdentityLedger, id: string, kind: LedgerKind, name: string, names: readonly string[], src: LedgerSource, birthDate?: string, nationalityId?: string): boolean {
  const e = l.entities[id];
  if (!e) {
    l.entities[id] = { id, kind, name, names: [...new Set([name, ...names])], firstSeen: src, sources: [src], ...(birthDate ? { birthDate } : {}), ...(nationalityId ? { nationalityId } : {}) };
    return true;
  }
  e.name = name;
  for (const n of [name, ...names]) if (!e.names.includes(n)) e.names.push(n);
  const i = e.sources.findIndex((s) => s.packId === src.packId);
  if (i >= 0) e.sources[i] = src; else e.sources.push(src);
  if (!e.birthDate && birthDate) e.birthDate = birthDate;
  if (!e.nationalityId && nationalityId) e.nationalityId = nationalityId;
  return false;
}

/** Registra no livro tudo que o pacote traz. Chamar só depois de uma instalação aceita. */
export function recordPack(l: IdentityLedger, pack: Datapack): { added: number; seen: number } {
  const src: LedgerSource = { packId: pack.manifest.packId, version: pack.manifest.version };
  let added = 0, seen = 0;
  for (const c of pack.clubs) { if (touch(l, c.id, "club", c.name, c.aliases ?? [], src)) added++; else seen++; }
  for (const p of pack.players) { if (touch(l, p.id, "plr", p.name, [], src, p.birthDate?.slice(0, 10), p.nationalityId)) added++; else seen++; }
  return { added, seen };
}

/** Segue as ligações até o id canônico. Sem ligação, devolve o próprio id. */
export function canonicalId(l: IdentityLedger, id: string): string {
  const next = new Map(l.links.map((k) => [k.from, k.to] as const));
  let cur = id;
  for (let i = 0; i <= l.links.length && next.has(cur); i++) cur = next.get(cur)!;
  return cur;
}

/** Mapa `id antigo → id canônico` de todas as ligações (para o provedor resolver ids antigos). */
export function aliasMap(l: IdentityLedger): Map<string, string> {
  return new Map(l.links.map((k) => [k.from, canonicalId(l, k.from)] as const));
}

export type LinkResult = { ok: true } | { ok: false; code: "bad_kind" | "same_id" | "unknown_id" | "already_linked" | "cycle" | "no_note"; message: string };

/**
 * Confirma que `from` é o mesmo que `to`. Só aceita ids que o livro conhece (já vistos em algum pacote), do mesmo tipo,
 * sem ciclo e com uma justificativa escrita. Não altera pacotes nem carreiras; só registra a decisão.
 */
export function linkIds(l: IdentityLedger, link: { from: string; to: string; note: string }): LinkResult {
  const kf = kindOf(link.from), kt = kindOf(link.to);
  if (!kf || kf !== kt) return { ok: false, code: "bad_kind", message: "Os dois ids precisam ser do mesmo tipo (plr: ou club:)." };
  if (link.from === link.to) return { ok: false, code: "same_id", message: "Um id não pode ser ligado a ele mesmo." };
  if (!link.note.trim()) return { ok: false, code: "no_note", message: "Explique por que são o mesmo (ligação é uma decisão humana e fica registrada)." };
  if (!l.entities[link.from] || !l.entities[link.to]) return { ok: false, code: "unknown_id", message: "Os dois ids precisam já ter aparecido em algum pacote instalado." };
  if (l.links.some((k) => k.from === link.from)) return { ok: false, code: "already_linked", message: `${link.from} já está ligado a outro id.` };
  if (canonicalId(l, link.to) === link.from) return { ok: false, code: "cycle", message: "A ligação criaria um ciclo." };
  l.links.push({ from: link.from, to: link.to, kind: kf, note: link.note.trim() });
  return { ok: true };
}

export function cloneLedger(l: IdentityLedger): IdentityLedger { return structuredClone(l); }

/** Lê um livro salvo (JSON qualquer). Recusa formato desconhecido ou ligações inconsistentes; nunca lança. */
export function parseLedger(input: unknown): { ok: true; ledger: IdentityLedger } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Livro de identidade inválido." };
  const o = input as { format?: unknown; entities?: unknown; links?: unknown };
  if (o.format !== 1) return { ok: false, error: `Formato de livro desconhecido: ${String(o.format)}.` };
  if (typeof o.entities !== "object" || o.entities === null || Array.isArray(o.entities) || !Array.isArray(o.links)) return { ok: false, error: "Livro de identidade incompleto." };
  const ledger: IdentityLedger = { format: 1, entities: structuredClone(o.entities) as Record<string, LedgerEntity>, links: [] };
  for (const k of o.links as unknown[]) {
    const x = k as { from?: unknown; to?: unknown; note?: unknown };
    if (typeof x?.from !== "string" || typeof x.to !== "string" || typeof x.note !== "string") return { ok: false, error: "Ligação inválida no livro." };
    const r = linkIds(ledger, { from: x.from, to: x.to, note: x.note });
    if (!r.ok) return { ok: false, error: `Ligação ${x.from} → ${x.to} inválida: ${r.message}` };
  }
  return { ok: true, ledger };
}
