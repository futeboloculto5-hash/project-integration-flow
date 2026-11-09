// Comparação entre duas versões de um datapack (importação incremental).
// Só descreve o que mudou; nada aqui apaga nem aplica. Jogador que some da versão nova aparece em `disappeared`
// e quem decide o que fazer é a camada de cima (a loja o mantém "aposentado" e carreiras existentes continuam resolvendo).
import type { ClubId, CompetitionId, CountryId, Datapack, PlayerId } from "./types";

export type FieldChange = { id: string; fields: string[] };
export type EntityDiff = { added: string[]; removed: string[]; changed: FieldChange[]; unchanged: number };
export type PlayerDiff = {
  added: PlayerId[];
  /** Estavam na versão anterior e não estão na nova. NUNCA são apagados das carreiras. */
  disappeared: PlayerId[];
  changed: FieldChange[];
  /** Mudaram de clube (ou ficaram livres/saíram de livre) entre as versões. Também aparecem em `changed`. */
  moved: { id: PlayerId; from: ClubId | null; to: ClubId | null }[];
  unchanged: number;
};
export type EditionChange = { key: string; joined: ClubId[]; left: ClubId[] };
export type PackDiff = {
  fromVersion: string | null;
  toVersion: string;
  players: PlayerDiff;
  clubs: EntityDiff;
  countries: EntityDiff;
  competitions: EntityDiff;
  editions: { added: string[]; removed: string[]; participants: EditionChange[]; unchanged: number };
};

/** Texto canônico (chaves em ordem) para comparar valores aninhados. */
function canon(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
}
const same = (a: unknown, b: unknown) => (a === b ? true : typeof a !== "object" || typeof b !== "object" ? false : canon(a) === canon(b));

/** Campos (de primeiro nível) que diferem entre dois registros. */
export function changedFields(a: object, b: object): string[] {
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  const out: string[] = [];
  for (const k of keys) if (!same(x[k], y[k])) out.push(k);
  return out.sort();
}

function diffById<T extends { id: string }>(prev: readonly T[], next: readonly T[]): EntityDiff {
  const before = new Map(prev.map((e) => [e.id, e] as const));
  const out: EntityDiff = { added: [], removed: [], changed: [], unchanged: 0 };
  const seen = new Set<string>();
  for (const e of next) {
    seen.add(e.id);
    const old = before.get(e.id);
    if (!old) { out.added.push(e.id); continue; }
    const f = changedFields(old, e);
    if (f.length > 0) out.changed.push({ id: e.id, fields: f }); else out.unchanged++;
  }
  for (const id of before.keys()) if (!seen.has(id)) out.removed.push(id);
  return out;
}

const editionKey = (competitionId: CompetitionId, season: string) => `${competitionId}@${season}`;

export function diffPacks(previous: Datapack | null, next: Datapack): PackDiff {
  const prev: Datapack = previous ?? { manifest: next.manifest, countries: [], competitions: [], editions: [], clubs: [], players: [] };
  const pd = diffById(prev.players, next.players);
  const prevById = new Map(prev.players.map((p) => [p.id, p] as const));
  const nextById = new Map(next.players.map((p) => [p.id, p] as const));
  const moved: PlayerDiff["moved"] = [];
  for (const c of pd.changed) {
    if (!c.fields.includes("clubId")) continue;
    const a = prevById.get(c.id as PlayerId);
    const b = nextById.get(c.id as PlayerId);
    if (a && b) moved.push({ id: a.id, from: a.clubId ?? null, to: b.clubId ?? null });
  }
  const prevEd = new Map(prev.editions.map((e) => [editionKey(e.competitionId, e.season), e] as const));
  const ed: PackDiff["editions"] = { added: [], removed: [], participants: [], unchanged: 0 };
  const seenEd = new Set<string>();
  for (const e of next.editions) {
    const key = editionKey(e.competitionId, e.season);
    seenEd.add(key);
    const old = prevEd.get(key);
    if (!old) { ed.added.push(key); continue; }
    const had = new Set(old.clubIds), has = new Set(e.clubIds);
    const joined = e.clubIds.filter((c) => !had.has(c)), left = old.clubIds.filter((c) => !has.has(c));
    if (joined.length > 0 || left.length > 0) ed.participants.push({ key, joined, left }); else ed.unchanged++;
  }
  for (const key of prevEd.keys()) if (!seenEd.has(key)) ed.removed.push(key);
  return {
    fromVersion: previous ? previous.manifest.version : null,
    toVersion: next.manifest.version,
    players: { added: pd.added as PlayerId[], disappeared: pd.removed as PlayerId[], changed: pd.changed, moved, unchanged: pd.unchanged },
    clubs: diffById(prev.clubs, next.clubs),
    countries: diffById<{ id: CountryId }>(prev.countries, next.countries),
    competitions: diffById(prev.competitions, next.competitions),
    editions: ed,
  };
}

/** true quando as duas versões têm exatamente o mesmo conteúdo (manifesto à parte). */
export function isEmptyDiff(d: PackDiff): boolean {
  const e = (x: EntityDiff) => x.added.length === 0 && x.removed.length === 0 && x.changed.length === 0;
  return d.players.added.length === 0 && d.players.disappeared.length === 0 && d.players.changed.length === 0
    && e(d.clubs) && e(d.countries) && e(d.competitions)
    && d.editions.added.length === 0 && d.editions.removed.length === 0 && d.editions.participants.length === 0;
}

/** Resumo curto para relatório. */
export function summarizeDiff(d: PackDiff): string {
  const p = d.players;
  return `v${d.fromVersion ?? "—"} → v${d.toVersion}: jogadores +${p.added.length} / alterados ${p.changed.length} (${p.moved.length} mudaram de clube) / sumiram ${p.disappeared.length}; clubes +${d.clubs.added.length}/-${d.clubs.removed.length}/~${d.clubs.changed.length}; edições +${d.editions.added.length}/-${d.editions.removed.length}, participantes alterados em ${d.editions.participants.length}.`;
}
