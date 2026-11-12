// Organiza clubes e competições de uma lista externa "id,nome" (sem país) POR PAÍS, usando o API-Football como referência.
// - Nome igual (normalizado) a um clube/competição do API em UM só país => atribuído ("nome").
// - Nome que existe em vários países (ex.: "Arsenal", "Premier League") => só atribui se a ordem dos ids ajudar: a lista
//   externa vem em blocos por país, em ordem alfabética do nome em inglês; então o país tem de estar entre o do vizinho
//   anterior e o do próximo já atribuídos ("nome+vizinhança"). Se a ordem não se confirmar nos dados, essa regra é desligada.
// - Sem correspondência, ou ainda ambíguo: fica PENDENTE, listado com os candidatos. Nunca se atribui por palpite.
import { normalizeName } from "./identity";
import { makeId, slugify } from "./ids";
import { resolveCountry } from "./api-football";
import type { ApiCatalog } from "./api-football-catalog";
import type { Club, Competition, CompetitionKind, Country, Datapack } from "./types";
import { DATAPACK_SCHEMA, DATAPACK_SCHEMA_VERSION } from "./types";

export type IdName = { id: number; name: string };
export type ApiTeamLite = { id: number; name: string; national?: boolean };
export type TeamsByCountry = Readonly<Record<string, readonly ApiTeamLite[]>>;
export type Basis = "nome" | "nome+vizinhança";
export type Assigned = { row: IdName; country: string; basis: Basis; apiId: number };
export type Pending = { row: IdName; reason: "sem_correspondencia" | "ambiguo"; candidates: string[]; hint?: string };
export type Assignment = { assigned: Assigned[]; pending: Pending[]; orderViolations: number; neighborRule: "ativa" | "desligada" };

const ckey = (name: string) => name.toLowerCase().replace(/-/g, " ").trim();

/** CSV "id,nome" sem cabeçalho (CRLF, aspas e BOM tolerados). Linhas inválidas são contadas, não adivinhadas. */
export function parseIdNameCsv(text: string): { rows: IdName[]; invalid: number } {
  const rows: IdName[] = []; let invalid = 0;
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = /^\s*"?(\d+)"?\s*,\s*(.*)$/.exec(line);
    const name = m ? m[2]!.trim().replace(/^"(.*)"$/, "$1").replace(/""/g, '"') : "";
    if (!m || !name) { invalid++; continue; }
    rows.push({ id: Number(m[1]), name });
  }
  return { rows, invalid };
}

type Index = Map<string, Map<string, number>>; // nome normalizado -> país -> id no API
function assign(rows: readonly IdName[], index: Index): Assignment {
  const sorted = [...rows].sort((a, b) => a.id - b.id);
  const cands = sorted.map((r) => index.get(normalizeName(r.name)));
  const res: (Assigned | null)[] = sorted.map((row, i) => { const c = cands[i]; if (c && c.size === 1) { const [country, apiId] = [...c][0]!; return { row, country, basis: "nome" as Basis, apiId }; } return null; });
  let violations = 0, prevKey = "", n = 0;
  for (const a of res) if (a) { n++; const k = ckey(a.country); if (prevKey && k < prevKey) violations++; prevKey = k; }
  const neighborRule = n > 0 && violations / n <= 0.02 ? "ativa" : "desligada";
  const final = [...res];
  if (neighborRule === "ativa") {
    for (let i = 0; i < sorted.length; i++) {
      const c = cands[i]; if (res[i] || !c || c.size < 2) continue;
      let lo: string | undefined, hi: string | undefined;
      for (let j = i - 1; j >= 0 && !lo; j--) if (res[j]) lo = ckey(res[j]!.country);
      for (let j = i + 1; j < sorted.length && !hi; j++) if (res[j]) hi = ckey(res[j]!.country);
      const ok = [...c].filter(([country]) => (!lo || ckey(country) >= lo) && (!hi || ckey(country) <= hi));
      if (ok.length === 1) final[i] = { row: sorted[i]!, country: ok[0]![0], basis: "nome+vizinhança", apiId: ok[0]![1] };
    }
  }
  const assigned: Assigned[] = [], pending: Pending[] = [];
  final.forEach((a, i) => {
    if (a) { assigned.push(a); return; }
    const c = cands[i];
    const p: Pending = { row: sorted[i]!, reason: c && c.size > 1 ? "ambiguo" : "sem_correspondencia", candidates: c ? [...c.keys()].sort() : [] };
    let before: Assigned | null = null, after: Assigned | null = null;
    for (let j = i - 1; j >= 0 && !before; j--) before = final[j] ?? null;
    for (let j = i + 1; j < final.length && !after; j++) after = final[j] ?? null;
    if (before && after && before.country === after.country) p.hint = before.country; // só uma pista para revisão humana
    pending.push(p);
  });
  return { assigned, pending, orderViolations: violations, neighborRule };
}

export function assignClubs(rows: readonly IdName[], teams: TeamsByCountry): Assignment {
  const index: Index = new Map();
  for (const [country, list] of Object.entries(teams)) for (const t of list) {
    if (t.national) continue;
    const k = normalizeName(t.name); if (!k) continue;
    const m = index.get(k) ?? new Map<string, number>(); if (!m.has(country)) m.set(country, t.id); index.set(k, m);
  }
  return assign(rows, index);
}

export function assignCompetitions(rows: readonly IdName[], catalog: ApiCatalog): Assignment {
  const index: Index = new Map();
  for (const c of catalog.countries) for (const l of c.leagues) {
    const k = normalizeName(l.name); if (!k) continue;
    const m = index.get(k) ?? new Map<string, number>(); if (!m.has(c.name)) m.set(c.name, l.id); index.set(k, m);
  }
  return assign(rows, index);
}

/** Pacote com os clubes e competições JÁ atribuídos (sem jogadores, sem edições). Pendentes ficam de fora e no relatório. */
export function buildCountryPack(input: { clubs: Assignment; competitions: Assignment; catalog: ApiCatalog; teams: TeamsByCountry; externalKey: string; packId: string; name: string; now: Date }): Datapack {
  const countries = new Map<string, Country>();
  const countryOf = (apiName: string) => { const r = resolveCountry(apiName)!; countries.set(r.country.id, r.country); return r.country; };
  const kindOf = new Map<number, CompetitionKind>();
  const leagueName = new Map<number, string>();
  for (const c of input.catalog.countries) for (const l of c.leagues) { kindOf.set(l.id, l.type === "cup" ? "cup" : "league"); leagueName.set(l.id, l.name); }
  const teamName = new Map<number, string>();
  for (const list of Object.values(input.teams)) for (const t of list) teamName.set(t.id, t.name);

  const used = new Set<string>();
  const unique = (kind: "club" | "comp", base: string, ...extras: string[]) => { let id = base; for (const e of extras) { if (!used.has(id)) break; id = `${base}-${e}`; } used.add(id); return id; };

  const clubs: Club[] = input.clubs.assigned.map((a) => {
    const c = countryOf(a.country);
    const name = teamName.get(a.apiId) ?? a.row.name;
    const id = unique("club", makeId("club", name), slugify(a.country), String(a.apiId));
    return { id: id as Club["id"], name, countryId: c.id, externalIds: { apiFootball: a.apiId, [input.externalKey]: a.row.id }, dataStatus: "pesquisa" };
  });
  const competitions: Competition[] = input.competitions.assigned.map((a) => {
    const c = countryOf(a.country);
    const name = leagueName.get(a.apiId) ?? a.row.name;
    const prefix = (c.code ?? slugify(c.name)).toLowerCase();
    const id = unique("comp", `comp:${prefix}-${slugify(name)}`, String(a.apiId));
    return { id: id as Competition["id"], name, countryId: c.id, kind: kindOf.get(a.apiId) ?? "league", externalIds: { apiFootball: a.apiId, [input.externalKey]: a.row.id }, dataStatus: "pesquisa" };
  });
  const day = input.now.toISOString().slice(0, 10);
  const cs = [...countries.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    manifest: { schema: DATAPACK_SCHEMA, schemaVersion: DATAPACK_SCHEMA_VERSION, packId: input.packId, version: `1.${day.slice(2).replaceAll("-", "")}.0`, name: input.name, createdAt: day, origin: "comunitario",
      source: { name: "Lista externa de clubes e competições + API-Football (país por correspondência de nome)", license: "Nomes e ids de lista externa de terceiros (autorização do autor pendente) e dados do API-Football da conta do dono do projeto. Não redistribuir.", retrievedAt: input.now.toISOString() },
      counts: { countries: cs.length, competitions: competitions.length, clubs: clubs.length, players: 0, editions: 0 },
      notes: "Só clubes e competições por país. País decidido por nome igual no API-Football; pendentes não entram. Sem jogadores." },
    countries: cs, competitions, editions: [], clubs, players: [],
  };
}
