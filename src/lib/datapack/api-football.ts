// Importador de liga a partir do API-Football, com ORÇAMENTO de chamadas.
// Módulo puro: não conhece Supabase nem a chave. A leitura é injetada (`read`), então os testes usam leituras falsas
// e a rota usa `footballRead` (que já tem cache compartilhado e limite diário).
//
// Custo de uma liga: 1 (leagues) + 1 (teams) + 1 por clube (players/squads) ≈ 22 chamadas para 20 clubes.
// Chamadas já em cache NÃO contam: se o orçamento acabar, rodar de novo no dia seguinte continua de onde parou.
//
// LIMITAÇÕES (documentadas de propósito):
// - O formato das respostas segue a documentação v3, mas AINDA NÃO foi conferido com uma resposta real desta conta.
//   Por isso tudo é lido de forma defensiva e o que não casa vira aviso, nunca dado inventado.
// - `players/squads` traz só nome, idade, número, posição (4 categorias) e foto: NÃO traz força. `overall` é uma
//   ESTIMATIVA determinística e todo jogador sai com dataStatus "estimativa". Fotos não são copiadas.
// - O elenco é o ATUAL do clube, mesmo que `season` seja anterior (o plano gratuito costuma limitar as temporadas).
import { makeId, slugify } from "./ids";
import type { Club, Competition, Country, CountryId, Datapack, Edition, Player, Position, Confederation } from "./types";
import { DATAPACK_SCHEMA, DATAPACK_SCHEMA_VERSION } from "./types";

export type ApiReadResult = { payload: any; cached: boolean; fetchedAt?: string };
export type ApiRead = (path: string, params: Record<string, string>) => Promise<ApiReadResult>;

export type CountryInfo = { id: CountryId; name: string; code: string; confederation: Confederation };
const C = (id: string, name: string, code: string, confederation: Confederation): [string, CountryInfo] => [id, { id: `ctry:${id}` as CountryId, name, code, confederation }];
/** Nomes em inglês (como o API-Football devolve) para os mesmos ids do pacote `competicoes-por-pais`. */
export const COUNTRY_ALIASES: Readonly<Record<string, CountryInfo>> = Object.fromEntries([
  ["Argentina", ...C("argentina", "Argentina", "ARG", "CONMEBOL")], ["Belgium", ...C("belgica", "Bélgica", "BEL", "UEFA")],
  ["Brazil", ...C("brasil", "Brasil", "BRA", "CONMEBOL")], ["China", ...C("china", "China", "CHN", "AFC")],
  ["Chile", ...C("chile", "Chile", "CHL", "CONMEBOL")], ["Denmark", ...C("dinamarca", "Dinamarca", "DNK", "UEFA")],
  ["England", ...C("inglaterra", "Inglaterra", "ENG", "UEFA")], ["France", ...C("franca", "França", "FRA", "UEFA")],
  ["Germany", ...C("alemanha", "Alemanha", "DEU", "UEFA")], ["Greece", ...C("grecia", "Grécia", "GRC", "UEFA")],
  ["Italy", ...C("italia", "Itália", "ITA", "UEFA")], ["South-Korea", ...C("coreia-do-sul", "Coreia do Sul", "KOR", "AFC")],
  ["Morocco", ...C("marrocos", "Marrocos", "MAR", "CAF")], ["Netherlands", ...C("paises-baixos", "Países Baixos", "NLD", "UEFA")],
  ["Portugal", ...C("portugal", "Portugal", "PRT", "UEFA")], ["San-Marino", ...C("san-marino", "San Marino", "SMR", "UEFA")],
  ["Saudi-Arabia", ...C("arabia-saudita", "Arábia Saudita", "SAU", "AFC")], ["Spain", ...C("espanha", "Espanha", "ESP", "UEFA")],
  ["Sweden", ...C("suecia", "Suécia", "SWE", "UEFA")], ["Turkey", ...C("turquia", "Turquia", "TUR", "UEFA")],
  ["United-Arab-Emirates", ...C("emirados-arabes-unidos", "Emirados Árabes Unidos", "ARE", "AFC")],
  ["USA", ...C("estados-unidos", "Estados Unidos", "USA", "CONCACAF")], ["Canada", ...C("canada", "Canadá", "CAN", "CONCACAF")],
  ["Iran", ...C("ira", "Irã", "IRN", "AFC")], ["Angola", ...C("angola", "Angola", "AGO", "CAF")],
  ["Indonesia", ...C("indonesia", "Indonésia", "IDN", "AFC")], ["Mexico", ...C("mexico", "México", "MEX", "CONCACAF")],
  ["Peru", ...C("peru", "Peru", "PER", "CONMEBOL")],
  ["Colombia", ...C("colombia", "Colômbia", "COL", "CONMEBOL")], ["Paraguay", ...C("paraguai", "Paraguai", "PRY", "CONMEBOL")],
].map(([k, , v]) => [k as string, v as CountryInfo]));

const aliasKey = (s: string) => s.trim().replace(/\s+/g, "-").toLowerCase();
const ALIAS_LOOKUP = new Map(Object.entries(COUNTRY_ALIASES).map(([k, v]) => [aliasKey(k), v] as const));
export function resolveCountry(apiName: unknown): { country: Country; mapped: boolean } | null {
  if (typeof apiName !== "string" || !apiName.trim()) return null;
  const known = ALIAS_LOOKUP.get(aliasKey(apiName));
  if (known) return { country: { id: known.id, name: known.name, code: known.code, confederation: known.confederation, dataStatus: "pesquisa" }, mapped: true };
  const slug = slugify(apiName);
  if (!slug) return null;
  // País fora da tabela: id e nome em inglês, sem código nem confederação (nada é adivinhado).
  return { country: { id: `ctry:${slug}` as CountryId, name: apiName.trim(), dataStatus: "pesquisa" }, mapped: false };
}

/**
 * Ligas cujo id no API-Football já é conhecido E que existem no pacote `competicoes-por-pais`.
 * Só vale se a resposta do API confirmar o país; senão o id é derivado do nome (e o aviso diz isso).
 */
export const KNOWN_LEAGUES: Readonly<Record<number, { competitionId: string; apiCountry: string }>> = {
  71: { competitionId: "comp:bra-brasileirao-serie-a", apiCountry: "Brazil" },
  72: { competitionId: "comp:bra-brasileirao-serie-b", apiCountry: "Brazil" },
};

const POSITION_MAP: Readonly<Record<string, Position>> = { goalkeeper: "GK", defender: "CB", midfielder: "CM", attacker: "ST" };
export const mapApiPosition = (p: unknown): Position | null => (typeof p === "string" ? POSITION_MAP[p.trim().toLowerCase()] ?? null : null);

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** ESTIMATIVA (não é dado do API): 60 de base, curva de idade e variação determinística por jogador. */
export function estimateOverall(apiPlayerId: number | string, age: number | undefined, position: Position): number {
  const spread = (hash(`${apiPlayerId}`) % 11) - 5; // -5..+5
  const ageAdj = age === undefined ? 0 : age < 20 ? -6 : age < 23 ? -2 : age <= 31 ? 2 : age <= 34 ? 0 : -3;
  const posAdj = position === "GK" ? -1 : 0;
  return Math.max(40, Math.min(80, 60 + spread + ageAdj + posAdj));
}

export type ImportLeagueOptions = {
  read: ApiRead;
  league: number;
  season: number;
  /** Teto de chamadas NOVAS (fora do cache) nesta execução. */
  maxCalls: number;
  /** Força o id da competição (ex.: "comp:bra-brasileirao-serie-a"); sem isso usa `KNOWN_LEAGUES` ou deriva do nome. */
  competitionId?: string;
  now?: () => Date;
  /** Prazo de validade do cache em horas (a rota usa mais que o padrão para a retomada do dia seguinte). */
  ttlHours?: number;
};

export type LeagueRunStatus = "complete" | "incomplete" | "failed";
export type LeagueRunResult = {
  status: LeagueRunStatus;
  /** Chamadas novas (não vieram do cache) gastas nesta execução. */
  callsUsed: number;
  cachedCalls: number;
  /** Chamadas que ainda faltam (novas) para completar, estimado. */
  remaining: { teams: number };
  pack?: Datapack;
  league?: { name: string; country: string; competitionId: string; knownMapping: boolean };
  clubs: { fetched: number; total: number; missing: string[] };
  warnings: string[];
  error?: string;
};

type ReadCtx = { used: number; cached: number; max: number };
class BudgetStop extends Error {}

async function limited(ctx: ReadCtx, read: ApiRead, path: string, params: Record<string, string>) {
  // A chamada pode ser cacheada (grátis); só sabemos depois. Por isso paramos ANTES de ultrapassar o teto: com `used === max`
  // ainda tentamos, mas se a resposta vier nova o teto já foi atingido e a próxima chamada para.
  if (ctx.used >= ctx.max) throw new BudgetStop();
  const r = await read(path, params);
  if (r.cached) ctx.cached++; else ctx.used++;
  return r.payload;
}

const asArray = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const posInt = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : undefined);

export async function importLeague(opts: ImportLeagueOptions): Promise<LeagueRunResult> {
  const ctx: ReadCtx = { used: 0, cached: 0, max: Math.max(0, Math.floor(opts.maxCalls)) };
  const warnings: string[] = [];
  const base = (over: Partial<LeagueRunResult>): LeagueRunResult => ({ status: "failed", callsUsed: ctx.used, cachedCalls: ctx.cached, remaining: { teams: 0 }, clubs: { fetched: 0, total: 0, missing: [] }, warnings, ...over });
  const lg = String(opts.league), season = String(opts.season);

  let leagueInfo: any, teamsRaw: any[];
  try {
    const l = await limited(ctx, opts.read, "leagues", { id: lg, season });
    leagueInfo = asArray(l?.response)[0];
    if (!leagueInfo?.league) return base({ error: "O API não devolveu a liga pedida (conferir o id e se a temporada está no plano)." });
    const t = await limited(ctx, opts.read, "teams", { league: lg, season });
    teamsRaw = asArray(t?.response);
    if (teamsRaw.length === 0) return base({ error: "O API não devolveu clubes para esta liga e temporada (cobertura ou plano)." });
  } catch (e) {
    return base(e instanceof BudgetStop ? { status: "incomplete", error: "Orçamento de chamadas insuficiente até para listar os clubes." } : { error: errMsg(e) });
  }

  const leagueName = str(leagueInfo.league.name) ?? `Liga ${lg}`;
  const apiCountry = str(leagueInfo.country?.name);
  const countryRes = resolveCountry(apiCountry);
  if (!countryRes) return base({ error: "O API não informou o país da liga." });
  if (!countryRes.mapped) warnings.push(`País "${apiCountry}" fora da tabela de nomes: id e nome ficaram em inglês, sem código nem confederação.`);

  const known = KNOWN_LEAGUES[opts.league];
  const knownMapping = !!known && known.apiCountry === apiCountry && opts.competitionId === undefined;
  if (known && !knownMapping && opts.competitionId === undefined) warnings.push(`Liga ${lg} esperava o país "${known.apiCountry}", mas o API disse "${apiCountry}": o id da competição foi derivado do nome.`);
  const competitionId = opts.competitionId ?? (knownMapping ? known!.competitionId : `comp:${(countryRes.country.code ?? slugify(countryRes.country.name)).toLowerCase()}-${slugify(leagueName)}`);
  if (!/^comp:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(competitionId)) return base({ error: `Id de competição inválido: ${competitionId}` });

  // clubes (dedup por id do API)
  const teams = new Map<number, { name: string; code?: string; city?: string; stadium?: string; country?: string }>();
  for (const item of teamsRaw) {
    const id = posInt(item?.team?.id), name = str(item?.team?.name);
    if (!id || !name) { warnings.push("Um clube da resposta veio sem id ou nome e foi ignorado."); continue; }
    if (teams.has(id)) continue;
    const t: { name: string; code?: string; city?: string; stadium?: string; country?: string } = { name };
    const code = str(item.team.code); if (code) t.code = code;
    const city = str(item.venue?.city); if (city) t.city = city;
    const stadium = str(item.venue?.name); if (stadium) t.stadium = stadium;
    const country = str(item.team.country); if (country) t.country = country;
    teams.set(id, t);
  }

  // elencos: 1 chamada por clube, na ordem do API; para quando o orçamento acaba
  const squads = new Map<number, any[]>();
  const missing: string[] = [];
  let stopped = false;
  for (const [id, t] of teams) {
    if (stopped) { missing.push(t.name); continue; }
    try {
      const s = await limited(ctx, opts.read, "players/squads", { team: String(id) });
      squads.set(id, asArray(asArray(s?.response)[0]?.players));
    } catch (e) {
      missing.push(t.name);
      if (e instanceof BudgetStop) stopped = true;
      else { stopped = true; warnings.push(`Parou em "${t.name}": ${errMsg(e)}`); }
    }
  }
  const clubsInfo = { fetched: squads.size, total: teams.size, missing };
  if (missing.length > 0) {
    return base({ status: "incomplete", clubs: clubsInfo, remaining: { teams: missing.length }, league: { name: leagueName, country: apiCountry ?? "", competitionId, knownMapping } });
  }

  // ---- monta o pacote ----
  const now = (opts.now ?? (() => new Date()))();
  const day = now.toISOString().slice(0, 10);
  const clubIdByApi = new Map<number, Club["id"]>();
  const usedClubIds = new Set<string>();
  const clubs: Club[] = [];
  for (const [id, t] of teams) {
    let cid = makeId("club", t.name);
    if (usedClubIds.has(cid)) cid = `${cid}-${id}`;
    usedClubIds.add(cid);
    clubIdByApi.set(id, cid as Club["id"]);
    const club: Club = { id: cid as Club["id"], name: t.name, countryId: countryRes.country.id, externalIds: { apiFootball: id }, dataStatus: "pesquisa" };
    if (t.code) club.short = t.code;
    if (t.city) club.city = t.city;
    if (t.stadium) club.stadium = t.stadium;
    clubs.push(club);
  }

  const players: Player[] = [];
  const seen = new Set<number>();
  let skippedPos = 0, skippedBad = 0, dup = 0;
  for (const [teamId, list] of squads) {
    for (const p of list) {
      const pid = posInt(p?.id), name = str(p?.name);
      if (!pid || !name) { skippedBad++; continue; }
      if (seen.has(pid)) { dup++; continue; }
      const position = mapApiPosition(p.position);
      if (!position) { skippedPos++; continue; }
      seen.add(pid);
      const age = typeof p.age === "number" && Number.isInteger(p.age) && p.age >= 14 && p.age <= 60 ? p.age : undefined;
      const player: Player = { id: `plr:${slugify(name) || "jogador"}-${pid}` as Player["id"], name, position, clubId: clubIdByApi.get(teamId)!, overall: estimateOverall(pid, age, position), externalIds: { apiFootball: pid }, dataStatus: "estimativa" };
      if (age !== undefined) player.age = age;
      players.push(player);
    }
  }
  if (skippedBad) warnings.push(`${skippedBad} jogador(es) sem id ou nome foram ignorados.`);
  if (skippedPos) warnings.push(`${skippedPos} jogador(es) com posição desconhecida foram ignorados.`);
  if (dup) warnings.push(`${dup} jogador(es) repetidos entre elencos (mantido o primeiro).`);

  const competition: Competition = { id: competitionId as Competition["id"], name: leagueName, countryId: countryRes.country.id, kind: str(leagueInfo.league.type)?.toLowerCase() === "cup" ? "cup" : "league", externalIds: { apiFootball: opts.league }, dataStatus: "pesquisa" };
  if (competition.kind === "league") competition.tier = 1; // só vale para divisão principal; conferir ao fundir com o pacote de competições
  const edition: Edition = { competitionId: competition.id, season, clubIds: clubs.map((c) => c.id), dataStatus: "pesquisa" };

  const pack: Datapack = {
    manifest: {
      schema: DATAPACK_SCHEMA, schemaVersion: DATAPACK_SCHEMA_VERSION,
      packId: `apifootball-${opts.league}`, version: `1.${day.slice(2).replaceAll("-", "")}.0`,
      name: `${leagueName} (${countryRes.country.name}) — API-Football`, createdAt: day, origin: "licenciado",
      source: { name: "API-Football (api-sports.io)", url: "https://www.api-football.com/documentation-v3", license: "Dados obtidos pela conta do dono do projeto, sob os termos de uso do API-Football. Não redistribuir fora deste projeto.", retrievedAt: now.toISOString() },
      counts: { countries: 1, competitions: 1, clubs: clubs.length, players: players.length, editions: 1 },
      notes: `Liga ${opts.league}, temporada ${season}. Elencos atuais do clube. Força (overall) ESTIMADA, não vem do API. Posições em 4 categorias do API (GK/CB/CM/ST).`,
    },
    countries: [countryRes.country], competitions: [competition], editions: [edition], clubs, players,
  };
  return base({ status: "complete", pack, clubs: clubsInfo, league: { name: leagueName, country: apiCountry ?? "", competitionId, knownMapping } });
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "erro desconhecido");
