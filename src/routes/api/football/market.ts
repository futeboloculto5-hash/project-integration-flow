import { createFileRoute } from "@tanstack/react-router";
import { footballRead, footballFailure } from '@/lib/football-api.server';

async function GET(request: Request) {
  const search = new URL(request.url).searchParams.get('search')?.trim() ?? '';
  if (search.length < 3 || search.length > 60 || !/^[\p{L}\p{N} .'-]+$/u.test(search)) return Response.json({ error: 'Informe pelo menos 3 letras do clube.', clubs: [] }, { status: 400 });
  try {
    const result = await footballRead('teams', { search });
    const clubs = result.payload.response.filter((x: any) => x.team?.id && x.team?.name && !x.team.national).slice(0, 30).map((x: any) => ({ apiId: x.team.id, name: x.team.name, country: x.team.country ?? null }));
    return Response.json({ clubs, source: 'API-Football', sourceUrl: 'https://www.api-football.com/documentation-v3', verifiedAt: result.fetchedAt, cached: result.cached, stale: result.stale });
  } catch (error) { return footballFailure(error); }
}

export const Route = createFileRoute("/api/football/market")({
  server: { handlers: { GET: ({ request }) => GET(request) } },
});
