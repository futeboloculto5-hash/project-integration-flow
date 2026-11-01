import { createFileRoute } from '@tanstack/react-router';
import { footballRead, footballFailure } from '@/lib/football-api.server';

async function getSeason(request: Request) {
  const year = new URL(request.url).searchParams.get('season') ?? '';
  if (!/^20\d{2}$/.test(year) || Number(year) < 2020 || Number(year) > new Date().getUTCFullYear()) return Response.json({ error: 'Temporada futura ou inválida: use o calendário simulado.' }, { status: 400 });
  try {
    const params = { league: '71', season: year };
    const league = await footballRead('leagues', { id: '71', season: year });
    const season = league.payload.response[0]?.seasons?.find((s: any) => String(s.year) === year);
    if (!season) return Response.json({ error: 'Esta temporada não está disponível na cobertura do plano.' }, { status: 404 });
    const unavailable: string[] = [];
    const read = async (path: string, available = true) => {
      if (!available) { unavailable.push(path); return []; }
      try { return (await footballRead(path, params)).payload.response; }
      catch { unavailable.push(path); return []; }
    };
    // Small bounded batch; all calls retain the shared daily reservation/cache.
    const [fixtures, standings, scorers, assists] = await Promise.all([
      read('fixtures'), read('standings', !!season.coverage?.standings),
      read('players/topscorers', !!season.coverage?.top_scorers), read('players/topassists', !!season.coverage?.top_assists),
    ]);
    const players = (list: any[]) => list.map(x => ({ name: x.player?.name ?? '', club: x.statistics?.[0]?.team?.name ?? '', goals: x.statistics?.[0]?.goals?.total ?? null, assists: x.statistics?.[0]?.goals?.assists ?? null }));
    return Response.json({ year, source: 'API-Football', verifiedAt: league.fetchedAt, unavailable, fixtures: fixtures.map((f: any) => ({ id: f.fixture.id, date: f.fixture.date.slice(0, 10), home: f.teams.home.id, away: f.teams.away.id, hg: f.goals.home, ag: f.goals.away, round: f.league.round })), standings: standings[0]?.league?.standings?.[0] ?? [], scorers: players(scorers), assists: players(assists) });
  } catch (error) { return footballFailure(error); }
}
export const Route = createFileRoute('/api/football/season')({ server: { handlers: { GET: ({ request }) => getSeason(request) } } });