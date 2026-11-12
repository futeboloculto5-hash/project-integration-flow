// Catálogo de países e competições do API-Football, em 2 chamadas (`leagues` sem filtro lista tudo).
// Só reorganiza o que o API informa (nada é inventado) em um formato compacto, agrupado por país, para revisão
// e para gerar o pacote de competições. Conferido com uma resposta real de `leagues` (1251 competições, 171 países); `countries` ainda não.
import type { ApiRead } from "./api-football";

export type CatalogLeague = { id: number; name: string; type: "league" | "cup" | "other"; firstSeason?: number; lastSeason?: number; current?: boolean };
export type CatalogCountry = { name: string; code?: string; leagues: CatalogLeague[] };
export type ApiCatalog = { countries: CatalogCountry[]; totals: { countries: number; leagues: number }; warnings: string[] };

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** `only`: nomes de país em inglês como o API usa (ex.: "Brazil"); vazio = todos. A competição sem país vai para "World". */
export function buildCatalog(countriesPayload: any, leaguesPayload: any, only?: readonly string[]): ApiCatalog {
  const warnings: string[] = [];
  const want = only && only.length > 0 ? new Set(only.map((s) => s.trim().toLowerCase())) : null;
  const map = new Map<string, CatalogCountry>();
  for (const c of Array.isArray(countriesPayload?.response) ? countriesPayload.response : []) {
    const name = str(c?.name); if (!name || (want && !want.has(name.toLowerCase()))) continue;
    const code = str(c?.code); map.set(name.toLowerCase(), { name, ...(code ? { code } : {}), leagues: [] });
  }
  let bad = 0;
  for (const item of Array.isArray(leaguesPayload?.response) ? leaguesPayload.response : []) {
    const id = num(item?.league?.id), name = str(item?.league?.name);
    if (!id || !name) { bad++; continue; }
    const cname = str(item?.country?.name) ?? "World";
    if (want && !want.has(cname.toLowerCase())) continue;
    let country = map.get(cname.toLowerCase());
    if (!country) { country = { name: cname, ...(str(item?.country?.code) ? { code: str(item.country.code)! } : {}), leagues: [] }; map.set(cname.toLowerCase(), country); }
    const t = str(item.league.type)?.toLowerCase();
    const years = (Array.isArray(item.seasons) ? item.seasons : []).map((s: any) => num(s?.year)).filter((y: number | undefined): y is number => y !== undefined);
    const league: CatalogLeague = { id, name, type: t === "league" ? "league" : t === "cup" ? "cup" : "other" };
    if (years.length) { league.firstSeason = Math.min(...years); league.lastSeason = Math.max(...years); }
    if ((Array.isArray(item.seasons) ? item.seasons : []).some((s: any) => s?.current === true)) league.current = true;
    country.leagues.push(league);
  }
  if (bad) warnings.push(`${bad} competição(ões) sem id ou nome foram ignoradas.`);
  const countries = [...map.values()].filter((c) => c.leagues.length > 0 || !want).sort((a, b) => a.name.localeCompare(b.name));
  for (const c of countries) c.leagues.sort((a, b) => a.id - b.id);
  return { countries, totals: { countries: countries.length, leagues: countries.reduce((n, c) => n + c.leagues.length, 0) }, warnings };
}

/** 2 chamadas no máximo (`countries` e `leagues`); ambas vão para o cache. */
export async function fetchCatalog(read: ApiRead, only?: readonly string[]): Promise<ApiCatalog & { callsUsed: number }> {
  let used = 0;
  const countries = await read("countries", {}); if (!countries.cached) used++;
  const leagues = await read("leagues", {}); if (!leagues.cached) used++;
  return { ...buildCatalog(countries.payload, leagues.payload, only), callsUsed: used };
}

export type TeamsRun = { teams: Record<string, { id: number; name: string; national?: boolean }[]>; missing: string[]; callsUsed: number; cachedCalls: number; warnings: string[] };
/** 1 chamada por país (`teams?country=`), parando antes de passar de `maxCalls` chamadas NOVAS. Em cache não conta; rodar de novo continua. */
export async function fetchTeamsByCountry(read: ApiRead, countries: readonly string[], maxCalls: number): Promise<TeamsRun> {
  const out: TeamsRun = { teams: {}, missing: [], callsUsed: 0, cachedCalls: 0, warnings: [] };
  let stop = false;
  for (const country of countries) {
    if (stop || out.callsUsed >= maxCalls) { out.missing.push(country); stop = true; continue; }
    try {
      const r = await read("teams", { country });
      if (r.cached) out.cachedCalls++; else out.callsUsed++;
      const list: { id: number; name: string; national?: boolean }[] = [];
      for (const item of Array.isArray(r.payload?.response) ? r.payload.response : []) {
        const id = num(item?.team?.id), name = str(item?.team?.name); if (!id || !name) continue;
        list.push(item.team.national === true ? { id, name, national: true } : { id, name });
      }
      out.teams[country] = list;
    } catch (e) { out.missing.push(country); out.warnings.push(`Parou em "${country}": ${e instanceof Error ? e.message : "erro"}`); stop = true; }
  }
  return out;
}
