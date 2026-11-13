// Aplica ao datapack os clubes de cada competição baixados do API-Football (`teams?league=ID&season=ANO`).
// Formato conferido com respostas reais: response[].team {id,name,code,country,national} e venue {name,city}.
// Regras: um clube = um id do API (nunca se une por nome); a edição mais RECENTE vence (uma edição já existente de temporada
// mais nova não é trocada por uma mais velha); seleções (`national`) não entram; resposta vazia vira "sem dados".
import { makeId, slugify } from "./ids";
import { resolveCountry } from "./api-football";
import type { Club, Country, Datapack, Edition } from "./types";

export type CompactTeam = { id: number; name: string; code?: string; country: string; city?: string; stadium?: string };
export type ApiTeamsFile = { league: number; season: number; teams: CompactTeam[] };

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Reduz a resposta do API ao que o datapack usa (sem logos nem endereços). */
export function compactTeamsResponse(league: number, season: number, payload: any): ApiTeamsFile {
  const teams: CompactTeam[] = [];
  const seen = new Set<number>();
  for (const item of Array.isArray(payload?.response) ? payload.response : []) {
    const id = item?.team?.id, name = str(item?.team?.name), country = str(item?.team?.country);
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0 || !name || !country || item.team.national === true || seen.has(id)) continue;
    seen.add(id);
    const t: CompactTeam = { id, name, country };
    const code = str(item.team.code); if (code) t.code = code;
    const city = str(item.venue?.city); if (city) t.city = city;
    const stadium = str(item.venue?.name); if (stadium) t.stadium = stadium;
    teams.push(t);
  }
  return { league, season, teams };
}

export type ApplyReport = { editionsAdded: number; editionsReplaced: number; editionsKeptNewer: number; clubsAdded: number; clubsRemoved: number; noData: number[]; unknownCompetition: number[]; warnings: string[] };
const year = (season: string) => Number(/^\d{4}/.exec(season)?.[0] ?? 0);

export function applyApiClubs(pack: Datapack, files: readonly ApiTeamsFile[]): { pack: Datapack; report: ApplyReport } {
  const rep: ApplyReport = { editionsAdded: 0, editionsReplaced: 0, editionsKeptNewer: 0, clubsAdded: 0, clubsRemoved: 0, noData: [], unknownCompetition: [], warnings: [] };
  const countries = new Map<string, Country>(pack.countries.map((c) => [c.id, c] as const));
  const clubs = new Map<string, Club>(pack.clubs.map((c) => [c.id, c] as const));
  const byApi = new Map<number, string>();
  for (const c of pack.clubs) { const a = (c.externalIds as { apiFootball?: number } | undefined)?.apiFootball; if (a !== undefined) byApi.set(a, c.id); }
  const compByApi = new Map<number, string>();
  for (const c of pack.competitions) { const a = (c.externalIds as { apiFootball?: number } | undefined)?.apiFootball; if (a !== undefined) compByApi.set(a, c.id); }
  let editions: Edition[] = [...pack.editions];

  for (const f of [...files].sort((a, b) => a.league - b.league || a.season - b.season)) {
    const competitionId = compByApi.get(f.league);
    if (!competitionId) { rep.unknownCompetition.push(f.league); continue; }
    if (f.teams.length === 0) { rep.noData.push(f.league); continue; }
    const existing = editions.find((e) => e.competitionId === competitionId);
    if (existing && year(existing.season) > f.season) { rep.editionsKeptNewer++; continue; }
    if (existing && year(existing.season) === f.season && existing.clubIds.every((id) => byApi.has(Number((clubs.get(id)?.externalIds as { apiFootball?: number } | undefined)?.apiFootball)))) { /* mesma temporada vinda do API: substitui */ }
    const ids: Club["id"][] = [];
    for (const t of f.teams) {
      let id = byApi.get(t.id) as Club["id"] | undefined;
      if (!id) {
        const rc = resolveCountry(t.country);
        if (!rc) { rep.warnings.push(`Clube ${t.name} (${t.id}) sem país reconhecível.`); continue; }
        const country = countries.get(rc.country.id) ?? rc.country;
        countries.set(country.id, country);
        const base = makeId("club", t.name);
        let cid = base;
        if (clubs.has(cid)) cid = `${base}-${slugify(t.country)}`;
        if (clubs.has(cid)) cid = `${base}-${t.id}`;
        const club: Club = { id: cid as Club["id"], name: t.name, countryId: country.id, externalIds: { apiFootball: t.id }, dataStatus: "pesquisa" };
        if (t.code) club.short = t.code;
        if (t.city) club.city = t.city;
        if (t.stadium) club.stadium = t.stadium;
        clubs.set(club.id, club); byApi.set(t.id, club.id); id = club.id; rep.clubsAdded++;
      }
      ids.push(id);
    }
    const edition: Edition = { competitionId: competitionId as Edition["competitionId"], season: String(f.season), clubIds: ids, dataStatus: "pesquisa" };
    if (existing) { editions = editions.map((e) => (e === existing ? edition : e)); rep.editionsReplaced++; } else { editions.push(edition); rep.editionsAdded++; }
  }
  // clubes que deixaram de estar em qualquer edição (por uma edição substituída) saem do pacote
  const inEdition = new Set(editions.flatMap((e) => e.clubIds));
  const keep = [...clubs.values()].filter((c) => inEdition.has(c.id));
  rep.clubsRemoved = clubs.size - keep.length;
  const usedCountries = new Set([...keep.map((c) => c.countryId), ...pack.competitions.flatMap((c) => (c.countryId ? [c.countryId] : []))]);
  const out: Datapack = { ...pack, countries: [...countries.values()].filter((c) => usedCountries.has(c.id)).sort((a, b) => a.name.localeCompare(b.name)), clubs: keep, editions };
  out.manifest = { ...pack.manifest, counts: { ...pack.manifest.counts, countries: out.countries.length, clubs: keep.length, editions: editions.length } };
  return { pack: out, report: rep };
}
