import { createFileRoute } from "@tanstack/react-router";
import { footballRead, footballFailure } from '@/lib/football-api.server';

const teamIds: Record<string, number> = { Flamengo: 127, Palmeiras: 121, Corinthians: 131, 'Fluminense FC': 124, 'São Paulo FC': 126, 'Manchester City': 50, Liverpool: 40, Arsenal: 42, 'Real Madrid': 541, Barcelona: 529, 'Bayern Munich': 157 }

async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const search = params.get('search')?.trim()
  const team = params.get('team')?.trim()
  if (!search && !team) return Response.json({ error: 'Informe search ou team', source: 'API-Football', players: [] }, { status: 400 })
  const season = params.get('season') ?? '2025';
  if (!/^20\d{2}$/.test(season) || (search && (search.length < 4 || search.length > 60))) return Response.json({ error: 'Busca ou temporada inválida', players: [] }, { status: 400 });
  const teamId = team ? teamIds[team] : undefined;
  if (!search && !teamId) return Response.json({ error: 'Clube não mapeado', players: [] }, { status: 404 });
  try {
    const result = await footballRead('players', search ? { search, season } : { team: String(teamId), season });
    const payload = result.payload;
    const unique = new Map<string, any>()
    for (const item of payload.response ?? []) {
      const player = item.player ?? item
      if (!player.id || unique.has(String(player.id))) continue
      const stats = item.statistics?.[0]
      unique.set(String(player.id), { id: player.id, name: player.name, age: player.age ?? null, nationality: player.nationality ?? null, photo: player.photo ?? null, position: stats?.games?.position ?? null, club: stats?.team?.name ?? null, source: 'API-Football' })
    }
    return Response.json({ source: 'API-Football', verifiedAt: result.fetchedAt, cached: result.cached, stale: result.stale, page: payload.paging, players: Array.from(unique.values()) })
  } catch (error) { return footballFailure(error); }
}

export const Route = createFileRoute("/api/football/players")({
  server: { handlers: { GET: ({ request }) => GET(request) } },
});
