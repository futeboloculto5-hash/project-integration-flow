import { createFileRoute } from "@tanstack/react-router";

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
  const club = new URL(request.url).searchParams.get('club') ?? ''
  const teamId = teamIds[club]
  const apiKey = process.env['API_FOOTBALL_KEY']
  if (!teamId) return Response.json({ error: 'Clube ainda não mapeado', source: 'API-Football', players: [] }, { status: 404 })
  if (!apiKey) return Response.json({ error: 'API_FOOTBALL_KEY não configurada', source: 'API-Football', players: [] }, { status: 503 })

  const response = await fetch(`https://v3.football.api-sports.io/players/squads?team=${teamId}`, {
    headers: { 'x-apisports-key': apiKey },

  })
  if (!response.ok) return Response.json({ error: 'API-Football indisponível', source: 'API-Football', players: [] }, { status: 502 })
  const payload = await response.json()
  const team = payload.response?.[0]
  const uniquePlayers = new Map<string, any>()
  for (const item of team?.players ?? []) {
    const position = item.position ?? 'Não divulgado'
    const key = String(item.id ?? `${item.name}-${position}`).trim().toLocaleLowerCase()
    if (!uniquePlayers.has(key)) uniquePlayers.set(key, {
      id: item.id,
      name: item.name,
      position,
      age: item.age ?? null,
      number: item.number ?? null,
      photo: item.photo ?? null,
    })
  }
  const players = Array.from(uniquePlayers.values())
  return Response.json({ source: 'API-Football', sourceUrl: 'https://www.api-football.com/', verifiedAt: new Date().toISOString(), team: team?.team?.name ?? club, players })
}

export const Route = createFileRoute("/api/football/squad")({
  server: { handlers: { GET: ({ request }) => GET(request) } },
});
