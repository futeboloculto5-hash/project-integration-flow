// Identidade de jogadores entre pacotes, temporadas e importações.
// O id estável (`plr:<slug>`) é a identidade: o mesmo id em versões ou clubes diferentes é o MESMO jogador (atualização/transferência).
// Ids diferentes nunca são fundidos aqui. Este módulo só aponta CANDIDATOS a duplicata para revisão humana:
//  - id externo igual (ex.: o mesmo apiFootball) com ids estáveis diferentes → provável;
//  - mesmo nome + mesma data de nascimento → provável;
//  - mesmo nome + mesma nacionalidade, sem nascimentos que os contradigam → possível (muito comum: só informativo).
// Nome igual, sozinho, nunca é candidato.
import type { Player, PlayerId } from "./types";

export type DuplicateKind = "external_id" | "name_and_birth" | "name_and_nationality";
export type DuplicateConfidence = "probable" | "possible";
export type DuplicateCandidate = {
  kind: DuplicateKind;
  confidence: DuplicateConfidence;
  /** O jogador do pacote que está sendo analisado. */
  a: PlayerId;
  /** O jogador já conhecido (mesmo pacote, outro pacote ou versão anterior). */
  b: PlayerId;
  /** De onde vem `b` ("mesmo-pacote" ou o packId). */
  sourceOfB: string;
  detail: string;
};

export type PlayerSource = { packId: string; players: readonly Player[] };

export const normalizeName = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

type Ref = { id: PlayerId; packId: string; birthDate: string | undefined; age: number | undefined };
export type IdentityIndex = {
  size: number;
  byId: Map<string, Ref>;
  byExternal: Map<string, Ref[]>;
  byNameBirth: Map<string, Ref[]>;
  byNameNationality: Map<string, Ref[]>;
};

const push = <K>(m: Map<K, Ref[]>, k: K, r: Ref) => { const l = m.get(k); if (l) l.push(r); else m.set(k, [r]); };
const externalKeys = (p: Player): string[] => {
  const out: string[] = [];
  if (p.externalIds) for (const [src, v] of Object.entries(p.externalIds)) out.push(`${src}=${String(v)}`);
  return out;
};

export function buildIdentityIndex(sources: readonly PlayerSource[]): IdentityIndex {
  const idx: IdentityIndex = { size: 0, byId: new Map(), byExternal: new Map(), byNameBirth: new Map(), byNameNationality: new Map() };
  for (const s of sources) {
    for (const p of s.players) {
      const ref: Ref = { id: p.id, packId: s.packId, birthDate: p.birthDate, age: p.age };
      idx.size++;
      if (!idx.byId.has(p.id)) idx.byId.set(p.id, ref);
      for (const k of externalKeys(p)) push(idx.byExternal, k, ref);
      const n = normalizeName(p.name);
      if (p.birthDate) push(idx.byNameBirth, `${n}|${p.birthDate.slice(0, 10)}`, ref);
      if (p.nationalityId) push(idx.byNameNationality, `${n}|${p.nationalityId}`, ref);
    }
  }
  return idx;
}

/** Idades que se contradizem de forma clara (mais de 2 anos de diferença) impedem o candidato "possível". */
function contradicts(a: Player, b: Ref): boolean {
  if (a.birthDate && b.birthDate) return a.birthDate.slice(0, 10) !== b.birthDate.slice(0, 10);
  if (a.age !== undefined && b.age !== undefined) return Math.abs(a.age - b.age) > 2;
  return false;
}

export type DuplicateScan = { candidates: DuplicateCandidate[]; total: number; truncated: boolean; /** Chaves com grupos grandes demais para comparar (ex.: um mesmo id externo em milhares de jogadores). */ skippedGroups: number };
export const DUPLICATE_LIMIT = 1000;
/** Grupos maiores que isto não são comparados par a par (evita custo quadrático em pacotes malformados ou hostis). */
export const MAX_GROUP = 50;

/**
 * Procura candidatos a duplicata de `players` dentro de `existing`.
 * `ownPackId`: os que têm o mesmo id de um jogador já conhecido são o mesmo jogador (não são candidatos).
 * Se `existing` contém o próprio pacote (comparação interna), o par (a,a) e pares simétricos são ignorados.
 */
export function findDuplicateCandidates(players: readonly Player[], existing: IdentityIndex, ownPackId: string, limit = DUPLICATE_LIMIT): DuplicateScan {
  const out: DuplicateCandidate[] = [];
  const seen = new Set<string>();
  let total = 0;
  const skipped = new Set<string>();
  const group = (m: Map<string, Ref[]>, k: string): Ref[] => {
    const g = m.get(k) ?? [];
    if (g.length > MAX_GROUP) { skipped.add(k); return []; }
    return g;
  };
  const add = (a: Player, b: Ref, kind: DuplicateKind, confidence: DuplicateConfidence, detail: string) => {
    if (b.id === a.id) return;
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    // Comparação interna: o par já foi visto no outro sentido. O tipo mais forte (visto primeiro) vale.
    if (seen.has(key)) return;
    seen.add(key);
    total++;
    if (out.length < limit) out.push({ kind, confidence, a: a.id, b: b.id, sourceOfB: b.packId === ownPackId ? "mesmo-pacote" : b.packId, detail });
  };
  for (const p of players) {
    for (const k of externalKeys(p)) for (const r of group(existing.byExternal, k)) add(p, r, "external_id", "probable", `Mesmo id externo (${k}) com ids estáveis diferentes.`);
    const n = normalizeName(p.name);
    if (p.birthDate) for (const r of group(existing.byNameBirth, `${n}|${p.birthDate.slice(0, 10)}`)) add(p, r, "name_and_birth", "probable", "Mesmo nome e mesma data de nascimento.");
    if (p.nationalityId) for (const r of group(existing.byNameNationality, `${n}|${p.nationalityId}`)) if (!contradicts(p, r)) add(p, r, "name_and_nationality", "possible", "Mesmo nome e nacionalidade (sem dados que os distingam).");
  }
  return { candidates: out, total, truncated: total > out.length, skippedGroups: skipped.size };
}

/** Duplicatas dentro de um mesmo pacote (ex.: a mesma pessoa listada em dois clubes com ids diferentes). */
export function findInternalDuplicates(packId: string, players: readonly Player[], limit = DUPLICATE_LIMIT): DuplicateScan {
  return findDuplicateCandidates(players, buildIdentityIndex([{ packId, players }]), packId, limit);
}
