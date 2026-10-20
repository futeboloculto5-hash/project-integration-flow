import { createFileRoute } from "@tanstack/react-router";
import { footballRead, footballFailure } from '@/lib/football-api.server';

const teamIds: Record<string, number> = {
  'Fluminense FC': 124,
  Flamengo: 127,
  Palmeiras: 121,
  Corinthians: 131,
  'São Paulo FC': 126,
  'Manchester City': 50,
  Liverpool: 40,
  Arsenal: 42,
  'Real Madrid': 541,
  Barcelona: 529,
  'Bayern Munich': 157,
}

async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const club = params.get('club') ?? ''
  const teamId = params.has('teamId') ? Number(params.get('teamId')) : teamIds[club]
  if (teamId == null || !Number.isSafeInteger(teamId) || teamId <= 0) return Response.json({ error: 'Clube inválido', source: 'API-Football', players: [] }, { status: 400 })
  try {
  const result = await footballRead('players/squads', { team: String(teamId) });
  const team = result.payload.response?.[0]
  const uniquePlayers = new Map<string, any>()
  for (const item of team?.players ?? []) {
    const position = item.position ?? 'Não divulgado'
    const key = String(item.id ?? `${item.name}-${position}`).trim().toLocaleLowerCase()
    if (item.id && item.name && !uniquePlayers.has(key)) uniquePlayers.set(key, {
      id: item.id,
      name: item.name,
      position,
      age: item.age ?? null,
      number: item.number ?? null,
      photo: item.photo ?? null,
    })
  }
  const players = Array.from(uniquePlayers.values())
  return Response.json({ source: 'API-Football', sourceUrl: 'https://www.api-football.com/documentation-v3', verifiedAt: result.fetchedAt, cached: result.cached, stale: result.stale, team: team?.team?.name ?? null, teamId, players })
  } catch (error) { return footballFailure(error); }
}

export const Route = createFileRoute("/api/football/squad")({
  server: { handlers: { GET: ({ request }) => GET(request) } },
});
