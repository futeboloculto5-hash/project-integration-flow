// Fatias de um datapack: só um país, uma região (confederação) ou uma liga, com as referências sempre fechadas
// (nada aponta para fora da fatia) e o manifesto com as contagens recalculadas. Serve para carregar só o necessário
// em vez do mundo inteiro. A fatia continua sendo um datapack válido.
import type { ClubId, CompetitionId, Confederation, CountryId, Datapack } from "./types";

export type SliceSelector = {
  countries?: readonly CountryId[];
  confederations?: readonly Confederation[];
  /** Inclui competições internacionais (sem país) cujos participantes estejam na fatia. Padrão: não. */
  includeInternational?: boolean;
};

function build(pack: Datapack, clubIds: Set<ClubId>, competitionIds: Set<CompetitionId>, extraFreeAgentCountries: Set<CountryId>): Datapack {
  const clubs = pack.clubs.filter((c) => clubIds.has(c.id));
  const players = pack.players.filter((p) => (p.clubId ? clubIds.has(p.clubId) : p.nationalityId !== undefined && extraFreeAgentCountries.has(p.nationalityId)));
  const competitions = pack.competitions.filter((c) => competitionIds.has(c.id));
  const editions = pack.editions.filter((e) => competitionIds.has(e.competitionId)).map((e) => ({ ...e, clubIds: e.clubIds.filter((id) => clubIds.has(id)) })).filter((e) => e.clubIds.length > 0);
  const needed = new Set<CountryId>();
  for (const c of clubs) needed.add(c.countryId);
  for (const c of competitions) if (c.countryId) needed.add(c.countryId);
  for (const p of players) if (p.nationalityId) needed.add(p.nationalityId);
  const countries = pack.countries.filter((c) => needed.has(c.id));
  return {
    manifest: { ...pack.manifest, counts: { countries: countries.length, competitions: competitions.length, clubs: clubs.length, players: players.length, editions: editions.length } },
    countries, competitions, editions, clubs, players,
  };
}

/** Fatia por país e/ou região. Jogadores são os dos clubes da fatia, mais agentes livres de nacionalidade na fatia. */
export function sliceByCountry(pack: Datapack, sel: SliceSelector): Datapack {
  const wanted = new Set<CountryId>(sel.countries ?? []);
  if (sel.confederations && sel.confederations.length > 0) {
    const confs = new Set<Confederation>(sel.confederations);
    for (const c of pack.countries) if (c.confederation && confs.has(c.confederation)) wanted.add(c.id);
  }
  const clubIds = new Set<ClubId>(pack.clubs.filter((c) => wanted.has(c.countryId)).map((c) => c.id));
  const competitionIds = new Set<CompetitionId>();
  for (const c of pack.competitions) {
    if (c.countryId ? wanted.has(c.countryId) : sel.includeInternational === true) competitionIds.add(c.id);
  }
  return build(pack, clubIds, competitionIds, wanted);
}

/** Fatia de uma competição: os clubes que a disputam (em `season`, ou em todas as temporadas) e os jogadores deles. */
export function sliceByCompetition(pack: Datapack, competitionId: CompetitionId, season?: string): Datapack {
  const clubIds = new Set<ClubId>();
  for (const e of pack.editions) if (e.competitionId === competitionId && (season === undefined || e.season === season)) for (const id of e.clubIds) clubIds.add(id);
  const keep = pack.competitions.some((c) => c.id === competitionId) ? new Set<CompetitionId>([competitionId]) : new Set<CompetitionId>();
  const out = build(pack, clubIds, keep, new Set());
  if (season !== undefined) out.editions = out.editions.filter((e) => e.season === season);
  out.manifest.counts.editions = out.editions.length;
  return out;
}

/** Resumo barato de "o que há no mundo", sem carregar os jogadores de cada país. Útil para listar o que dá para carregar. */
export type PackCatalogEntry = { countryId: CountryId; name: string; confederation?: Confederation; clubs: number; players: number; competitions: number };
export function catalogByCountry(pack: Datapack): PackCatalogEntry[] {
  const clubCountry = new Map<ClubId, CountryId>(pack.clubs.map((c) => [c.id, c.countryId] as const));
  const clubs = new Map<CountryId, number>(), players = new Map<CountryId, number>(), comps = new Map<CountryId, number>();
  for (const c of pack.clubs) clubs.set(c.countryId, (clubs.get(c.countryId) ?? 0) + 1);
  for (const p of pack.players) { const k = p.clubId ? clubCountry.get(p.clubId) : undefined; if (k) players.set(k, (players.get(k) ?? 0) + 1); }
  for (const c of pack.competitions) if (c.countryId) comps.set(c.countryId, (comps.get(c.countryId) ?? 0) + 1);
  return pack.countries.map((c) => ({
    countryId: c.id, name: c.name, ...(c.confederation ? { confederation: c.confederation } : {}),
    clubs: clubs.get(c.id) ?? 0, players: players.get(c.id) ?? 0, competitions: comps.get(c.id) ?? 0,
  }));
}
