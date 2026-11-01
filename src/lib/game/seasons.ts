import { CLUBS, clubById, type Club } from './clubs';
import { addDays, advanceDay, aiSquad, bestEleven, computeTable, generateSquad, playerValue, playerWage, refreshMarket, seeded, teamRating, type CareerV2, type Fixture, type Player, type Row } from './career';
import { simulateMatch } from '@/lib/career/simulation';

export type Goal = { clubId: string; playerId: string; player: string; assistId?: string; assist?: string; minute: number };
export type SeasonArchive = { year: string; divisions: Record<string, string[]>; fixtures: Fixture[]; cup: Fixture[]; tables: Record<string, Row[]>; relegated: string[]; promoted: string[]; cupWinner?: string; leaders: Leader[] };
export type SeasonState = { schema: 1; divisions: Record<string, string[]>; clubs: Club[]; cup: Fixture[]; history: SeasonArchive[]; reference?: SeasonReference };
export type SeasonReference = { year: string; source: 'API-Football'; verifiedAt: string | null; fixtures: { id: number; date: string; home: number; away: number; hg: number | null; ag: number | null; round: string }[]; standings: { rank: number; team: { name: string }; points: number; all: { played: number } }[]; scorers: { name: string; club: string; goals: number | null; assists: number | null }[]; assists: { name: string; club: string; goals: number | null; assists: number | null }[]; unavailable: string[] };
export type Leader = { playerId: string; player: string; clubId: string; goals: number; assists: number };
export const careerClub = (c: CareerV2, id: string) => c.seasonState?.clubs.find(x => x.id === id) ?? clubById(id);
export const divisionOf = (c: CareerV2, id = c.clubId) => Object.entries(c.seasonState?.divisions ?? { A: CLUBS.map(x => x.id) }).find(([, ids]) => ids.includes(id))?.[0] ?? 'A';
export const leagueFixtures = (c: CareerV2, division = divisionOf(c)) => c.fixtures.filter(f => (f.division ?? 'A') === division);
export const seasonTable = (c: CareerV2, division = divisionOf(c)) => computeTable(leagueFixtures(c, division), c.seasonState?.divisions[division]);
export const allFixtures = (c: CareerV2) => [...c.fixtures, ...c.seasonState?.cup ?? []].sort((a, b) => a.date.localeCompare(b.date) || (a.competition === 'cup' ? 1 : -1));
export const seasonFinished = (c: CareerV2) => allFixtures(c).every(f => f.hg != null && f.ag != null) && !!c.seasonState?.cup.some(f => f.round === 4 && f.winner);

/** Additive and idempotent: existing fixtures, players and results are never replaced. */
export function initializeSeason(c: CareerV2): CareerV2 {
  if (c.seasonState) return c;
  const next = structuredClone(c);
  const reserves = Array.from({ length: 20 }, (_, i) => clubById(`sim-b-${i + 1}`));
  const b = reserves.map(x => x.id);
  const first = c.fixtures.map(f => f.date).sort()[0] ?? `${c.season}-03-29`;
  next.seasonState = { schema: 1, clubs: [...CLUBS, ...reserves], divisions: { A: CLUBS.map(x => x.id), B: b }, cup: [], history: [] };
  next.otherSquads ??= {};
  for (const club of next.seasonState.clubs) {
    if (club.id === c.clubId || next.otherSquads[club.id]) continue;
    next.otherSquads[club.id] = aiSquad(next, club.id).map(p => ({ ...p, contractUntil: addDays(c.date, 730) }));
  }
  // The new second division starts at the current career date: no retroactive financial/result rewrite.
  next.fixtures = [...c.fixtures, ...roundRobin(b, c.season, 'B', c.date > first ? addDays(c.date, 2) : first)];
  const entrants = [...CLUBS].sort((a, b) => b.rating - a.rating).slice(0, 16).map(x => x.id);
  if (!entrants.includes(c.clubId)) entrants[15] = c.clubId;
  next.seasonState.cup = cupRound(entrants, 1, addDays(c.date, 4), c.season);
  return next;
}

export function roundRobin(ids: string[], year: string, division: string, start = `${year}-03-29`): Fixture[] {
  const rotation = [...ids];
  if (rotation.length % 2) rotation.push('bye');
  const half: [string, string][][] = [];
  for (let rd = 0; rd < rotation.length - 1; rd++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < rotation.length / 2; i++) {
      const a = rotation[i], b = rotation[rotation.length - 1 - i];
      if (!a || !b || a === 'bye' || b === 'bye') continue;
      pairs.push(rd % 2 ? [b, a] : [a, b]);
    }
    half.push(pairs);
    const last = rotation.pop(); if (last) rotation.splice(1, 0, last);
  }
  return [...half, ...half.map(pairs => pairs.map(([a, b]): [string, string] => [b, a]))].flatMap((pairs, rd) => pairs.map(([home, away]) => ({ round: rd + 1, home, away, date: addDays(start, rd * 7), division, competition: 'league', scheduleSource: 'simulated' })));
}
function cupRound(ids: string[], round: number, date: string, year: string): Fixture[] {
  return Array.from({ length: Math.floor(ids.length / 2) }, (_, i) => ({ round, home: ids[i * 2] ?? '', away: ids[i * 2 + 1] ?? '', date, competition: 'cup', scheduleSource: 'simulated', id: `${year}-cup-${round}-${i}` }));
}
export function progressCup(c: CareerV2) {
  const cup = c.seasonState?.cup;
  if (!cup?.length) return;
  const latest = Math.max(...cup.map(f => f.round));
  const games = cup.filter(f => f.round === latest);
  if (latest >= 4 || games.some(f => !f.winner)) return;
  const winners = games.flatMap(f => f.winner ? [f.winner] : []);
  cup.push(...cupRound(winners, latest + 1, addDays(games[0]?.date ?? c.date, 28), c.season));
}

export function recordFixture(c: CareerV2, f: Fixture, hg: number, ag: number, goals?: Goal[]) {
  if (f.hg != null || !Number.isInteger(hg) || !Number.isInteger(ag) || hg < 0 || ag < 0) return;
  f.hg = hg; f.ag = ag; f.resultSource = 'simulated';
  const r = seeded(`${c.season}:${f.competition}:${f.round}:${f.home}:${f.away}:goals`);
  f.goals = goals ?? [];
  if (!goals) for (const [id, count] of [[f.home, hg], [f.away, ag]] as [string, number][]) {
    const squad = id === c.clubId ? c.squad : aiSquad(c, id);
    const xi = bestEleven(squad).filter(p => p.pos !== 'GOL');
    const weighted = xi.flatMap(p => Array(p.pos === 'ATA' ? 5 : p.pos === 'MEI' ? 3 : 1).fill(p) as Player[]);
    for (let i = 0; i < count; i++) {
      const scorer = weighted[Math.floor(r() * weighted.length)]; if (!scorer) continue;
      const options = xi.filter(p => p.id !== scorer.id);
      const assist = r() < 0.75 ? options[Math.floor(r() * options.length)] : undefined;
      f.goals.push({ clubId: id, playerId: scorer.id, player: scorer.name, minute: 1 + Math.floor(r() * 90), ...(assist ? { assistId: assist.id, assist: assist.name } : {}) });
    }
  }
  if (f.competition === 'cup') {
    if (hg === ag) { const homeWins = r() < 0.5; f.penalties = homeWins ? [5, 4] : [4, 5]; f.winner = homeWins ? f.home : f.away; }
    else f.winner = hg > ag ? f.home : f.away;
  }
}
export function simulateDue(c: CareerV2, through: string) {
  for (const f of allFixtures(c)) {
    if (f.hg != null || f.date > through || f.home === c.clubId || f.away === c.clubId) continue;
    const res = simulateMatch(teamRating(aiSquad(c, f.home)) + 2, teamRating(aiSquad(c, f.away)), `${c.season}:${f.competition}:${f.round}:${f.home}:${f.away}`);
    recordFixture(c, f, res.homeGoals, res.awayGoals);
    c.aiBalances ??= {};
    for (const id of [f.home, f.away]) c.aiBalances[id] = (c.aiBalances[id] ?? careerClub(c, id).budget) + 300_000;
  }
  progressCup(c);
}
export function leaders(fixtures: Fixture[]): Leader[] {
  const map = new Map<string, Leader>();
  const get = (id: string, name: string, clubId: string) => { const row = map.get(id) ?? { playerId: id, player: name, clubId, goals: 0, assists: 0 }; map.set(id, row); return row; };
  for (const f of fixtures) for (const g of f.goals ?? []) {
    get(g.playerId, g.player, g.clubId).goals++;
    if (g.assistId && g.assist) get(g.assistId, g.assist, g.clubId).assists++;
  }
  return [...map.values()].sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.player.localeCompare(b.player));
}

export function startNextSeason(c: CareerV2): { career: CareerV2; error?: string } {
  if (!seasonFinished(c)) return { career: c, error: 'Conclua todas as partidas da liga e da copa antes de iniciar outra temporada.' };
  const latest = allFixtures(c).map(f => f.date).sort().at(-1) ?? c.date;
  const nextYear = String(Number(c.season) + 1);
  const targetDate = `${nextYear}-03-24` > latest ? `${nextYear}-03-24` : addDays(latest, 7);
  // Offseason uses the same daily finance/loans/contracts path, never silently skipping charges.
  let offseason = c;
  for (let days = 0; days < 730 && offseason.date < targetDate; days++) offseason = advanceDay(offseason).career;
  const next = structuredClone(offseason), state = next.seasonState;
  if (!state) return { career: c, error: 'Temporada indisponível.' };
  const a = seasonTable(next, 'A'), b = seasonTable(next, 'B');
  const relegated = a.slice(-4).map(x => x.clubId), promoted = b.slice(0, 4).map(x => x.clubId);
  const cupWinner = state.cup.find(f => f.round === 4)?.winner;
  state.history.push({ year: c.season, divisions: structuredClone(state.divisions), fixtures: structuredClone(c.fixtures), cup: structuredClone(state.cup), tables: { A: a, B: b }, relegated, promoted, ...(cupWinner ? { cupWinner } : {}), leaders: leaders(allFixtures(c)) });
  state.divisions['A'] = [...a.map(x => x.clubId).filter(id => !relegated.includes(id)), ...promoted];
  state.divisions['B'] = [...b.map(x => x.clubId).filter(id => !promoted.includes(id)), ...relegated];
  next.season = nextYear;
  // Never move the clock backwards when an old career has an unusually late calendar.
  next.date = offseason.date;
  delete state.reference;
  next.fixtures = Object.entries(state.divisions).flatMap(([division, ids]) => roundRobin(ids, next.season, division, addDays(next.date, 5)));
  const entrants = a.slice(0, 12).map(x => x.clubId).concat(b.slice(0, 4).map(x => x.clubId));
  if (!entrants.includes(c.clubId)) entrants[15] = c.clubId;
  state.cup = cupRound(entrants, 1, addDays(next.date, 9), next.season);
  const evolve = (players: Player[], id: string) => players.map(p => {
    const r = seeded(`development:${next.season}:${p.id}`);
    const age = p.age + 1;
    const change = p.age < 24 ? 1 + Math.floor(r() * 3) : p.age >= 31 ? -1 - Math.floor(r() * 2) : Math.floor(r() * 3) - 1;
    const rating = Math.max(45, Math.min(95, p.rating + change));
    return { ...p, age, rating, value: playerValue(rating, age), ...(id !== c.clubId ? { wage: playerWage(rating) } : {}) };
  });
  next.squad = evolve(next.squad, c.clubId);
  for (const [id, players] of Object.entries(next.otherSquads ?? {})) {
    const developed = evolve(players, id);
    next.otherSquads ??= {}; next.otherSquads[id] = developed;
    // Simulated academy recruitment replenishes depleted AI squads, never replaces owned players.
    if (developed.length < 22) next.otherSquads[id].push(...generateSquad(id, teamRating(developed), `academy-${next.season}`).slice(0, 22 - developed.length).map(p => ({ ...p, age: 18, contractUntil: addDays(next.date, 730) })));
    next.aiBalances ??= {}; next.aiBalances[id] = (next.aiBalances[id] ?? careerClub(next, id).budget) + (state.divisions['A']?.includes(id) ? 20_000_000 : 8_000_000);
  }
  next.market = refreshMarket(next, next.date);
  next.news.unshift({ id: `season-${next.season}`, date: next.date, kind: 'info', title: `Temporada ${next.season} · Série ${divisionOf(next)}`, body: 'Nova temporada simulada: acesso e rebaixamento aplicados, jogadores evoluídos e histórico preservado.' });
  return { career: next };
}

/** Real schedule only before play begins and only if a complete compatible league was returned. */
export function applySeasonReference(c: CareerV2, reference: SeasonReference): CareerV2 {
  if (reference.year !== c.season) return c;
  const next = structuredClone(c); if (!next.seasonState) return next;
  next.seasonState.reference = reference;
  const apiIds = new Map(next.seasonState.clubs.map(x => [x.apiId, x.id]));
  const mapped: Fixture[] = reference.fixtures.flatMap(f => {
    const home = apiIds.get(f.home), away = apiIds.get(f.away), round = Number(f.round.match(/(\d+)$/)?.[1]);
    if (!home || !away || !round || !/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return [];
    return [{ id: String(f.id), home, away, round, date: f.date, division: 'A', competition: 'league', scheduleSource: 'API-Football' }];
  });
  const existing = leagueFixtures(next, 'A');
  const pairs = new Set(mapped.map(f => `${f.home}:${f.away}`));
  if (existing.every(f => f.hg == null) && mapped.length === 380 && pairs.size === 380 && mapped.every(f => f.date >= c.date) && mapped.every(f => next.seasonState?.divisions['A']?.includes(f.home) && next.seasonState.divisions['A']?.includes(f.away))) {
    next.fixtures = [...mapped, ...next.fixtures.filter(f => (f.division ?? 'A') !== 'A')];
  }
  // Official scores never overwrite career results; they remain a separate reference view.
  return next;
}