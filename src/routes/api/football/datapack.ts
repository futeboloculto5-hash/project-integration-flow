import { createFileRoute } from "@tanstack/react-router";
import { footballRead, footballFailure } from "@/lib/football-api.server";
import { importLeague } from "@/lib/datapack/api-football";
import { fetchCatalog, fetchTeamsByCountry } from "@/lib/datapack/api-football-catalog";

// Rota ADMINISTRATIVA e isolada: gera um datapack de uma liga a partir do API-Football, respeitando um teto de chamadas.
// Fica desligada (404) enquanto o segredo DATAPACK_ADMIN_TOKEN não existir. Não grava nada no jogo nem em saves:
// devolve o JSON do pacote para ser revisado e importado depois. Chamadas em cache não gastam orçamento.
// Catálogo: GET /api/football/datapack?mode=catalog   (países e competições; 2 chamadas)
// Clubes por país: GET /api/football/datapack?mode=teams&countries=Albania,Argentina&maxCalls=40   (1 chamada por país)
// Uso: GET /api/football/datapack?league=71&season=2023&maxCalls=30   com o cabeçalho  x-admin-token: <segredo>

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
const int = (v: string | null, min: number, max: number) => {
  if (v === null || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
};

async function GET(request: Request) {
  const token = process.env["DATAPACK_ADMIN_TOKEN"];
  if (!token) return new Response("Not found", { status: 404 });
  if (!safeEqual(request.headers.get("x-admin-token") ?? "", token)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  const q = new URL(request.url).searchParams;
  if (q.get("mode") === "catalog") {
    // Catálogo de países e competições: 2 chamadas no total. `countries=Brazil,Colombia` filtra a resposta (opcional).
    try {
      const only = (q.get("countries") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      const r = await fetchCatalog(async (path, params) => { const x = await footballRead(path, params, 24 * 14); return { payload: x.payload, cached: x.cached }; }, only);
      return Response.json(r, { headers: { "cache-control": "no-store" } });
    } catch (error) { return footballFailure(error); }
  }
  if (q.get("mode") === "teams") {
    // Clubes por país: 1 chamada por país. `countries=Albania,Argentina` (nomes do API, em inglês). Sem teto estourado: `maxCalls` (padrão 40).
    const list = (q.get("countries") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const cap = int(q.get("maxCalls") ?? "40", 1, 90);
    if (list.length === 0 || list.length > 90 || !cap) return Response.json({ error: "Parâmetros: countries (lista separada por vírgula) e maxCalls (1 a 90, padrão 40)." }, { status: 400 });
    try {
      const r = await fetchTeamsByCountry(async (path, params) => { const x = await footballRead(path, params, 24 * 14); return { payload: x.payload, cached: x.cached }; }, list, cap);
      return Response.json(r, { headers: { "cache-control": "no-store" } });
    } catch (error) { return footballFailure(error); }
  }
  const league = int(q.get("league"), 1, 99999), season = int(q.get("season"), 1990, 2100);
  const maxCalls = int(q.get("maxCalls") ?? "30", 1, 60);
  if (!league || !season || !maxCalls) return Response.json({ error: "Parâmetros: league, season (aaaa) e maxCalls (1 a 60, padrão 30)." }, { status: 400 });
  const competitionId = q.get("competitionId") ?? undefined;
  try {
    // 14 dias de cache: se o orçamento do dia acabar, rodar de novo amanhã reaproveita tudo que já foi buscado.
    const read = async (path: string, params: Record<string, string>) => {
      const r = await footballRead(path, params, 24 * 14);
      return { payload: r.payload, cached: r.cached };
    };
    const result = await importLeague({ read, league, season, maxCalls, ...(competitionId ? { competitionId } : {}) });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) { return footballFailure(error); }
}

export const Route = createFileRoute("/api/football/datapack")({
  server: { handlers: { GET: ({ request }) => GET(request) } },
});
