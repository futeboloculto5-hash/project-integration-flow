import { createFileRoute } from "@tanstack/react-router";

const teamIds: Record<string, number> = { Flamengo: 127, Palmeiras: 121, Corinthians: 131, 'Fluminense FC': 124, 'São Paulo FC': 126, 'Manchester City': 50, Liverpool: 40, Arsenal: 42, 'Real Madrid': 541, Barcelona: 529, 'Bayern Munich': 157 }

async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const search = params.get('search')?.trim()
  const team = params.get('team')?.trim()
  const key = process.env.API_FOOTBALL_KEY
  if (!key) return Response.json({ error: 'API_FOOTBALL_KEY não configurada', source: 'API-Football', players: [] }, { status: 503 })
  if (!search && !team) return Response.json({ error: 'Informe search ou team', source: 'API-Football', players: [] }, { status: 400 })
  const query = search ? `search=${encodeURIComponent(search)}` : `team=${teamIds[team!] ?? ''}`
  if (query.endsWith('=')) return Response.json({ error: 'Clube não mapeado', source: 'API-Football', players: [] }, { status: 404 })
  try {
    const response = await fetch(`https://v3.football.api-sports.io/players?${query}&season=2025`, { headers: { 'x-apisports-key': key } })
    const payload = await response.json()
    if (!response.ok) return Response.json({ error: payload.errors ?? 'API-Football indisponível', source: 'API-Football', players: [] }, { status: response.status === 429 ? 429 : 502 })
    const unique = new Map<string, any>()
    for (const item of payload.response ?? []) {
      const player = item.player ?? item
      if (!player.id || unique.has(String(player.id))) continue
      const stats = item.statistics?.[0]
      unique.set(String(player.id), { id: player.id, name: player.name, age: player.age ?? null, nationality: player.nationality ?? null, photo: player.photo ?? null, position: stats?.games?.position ?? null, club: stats?.team?.name ?? null, source: 'API-Football' })
    }
    return Response.json({ source: 'API-Football', verifiedAt: new Date().toISOString(), players: Array.from(unique.values()) })
  } catch { return Response.json({ error: 'Falha de rede ao consultar API-Football', source: 'API-Football', players: [] }, { status: 502 }) }
}

export const Route = createFileRoute("/api/football/players")({
  server: { handlers: { GET: ({ request }) => GET(request) } },
});
