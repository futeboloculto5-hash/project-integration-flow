// Shared, durable cache and conservative budget for every upstream football read.
export async function footballRead(path: string, params: Record<string, string>, ttlHours = 168) {
  const key = process.env['API_FOOTBALL_KEY'];
  if (!key) throw new FootballError('A conexão de futebol não está disponível.', 503);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const query = new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
  const requestKey = `${path}?${query}`;
  const { data: cached, error: cacheError } = await supabaseAdmin.from('football_api_cache').select('payload,fetched_at').eq('request_key', requestKey).maybeSingle();
  if (cacheError) throw new FootballError('Não foi possível verificar o limite de consultas.', 503);
  const fresh = cached?.payload && cached.fetched_at && Date.now() - Date.parse(cached.fetched_at) < ttlHours * 3600000;
  if (fresh) return { payload: cached.payload as any, fetchedAt: cached.fetched_at, cached: true, stale: false };
  const { data: reservation, error } = await supabaseAdmin.rpc('reserve_football_request', { p_key: requestKey });
  if (error) throw new FootballError('Não foi possível verificar o limite de consultas.', 503);
  const fallback = () => cached?.payload ? { payload: cached.payload as any, fetchedAt: cached.fetched_at, cached: true, stale: true } : null;
  if (reservation !== 'ok') {
    const old = fallback();
    if (old) return old;
    throw new FootballError(reservation === 'busy' ? 'Consulta em andamento. Tente novamente em alguns segundos.' : 'Limite preventivo de consultas atingido. Os dados já carregados continuam disponíveis.', 429);
  }
  try {
    const response = await fetch(`https://v3.football.api-sports.io/${requestKey}`, { headers: { 'x-apisports-key': key }, signal: AbortSignal.timeout(12000) });
    const payload = await response.json() as any;
    const hasErrors = payload.errors && Object.keys(payload.errors).length > 0;
    if (!response.ok || hasErrors || !Array.isArray(payload.response)) {
      if (response.status === 429 || /rate|limit|quota/i.test(JSON.stringify(payload.errors ?? {}))) {
        const until = new Date(); until.setUTCHours(24, 0, 0, 0);
        await supabaseAdmin.from('football_api_budget').update({ blocked_until: until.toISOString() }).eq('day', new Date().toISOString().slice(0, 10));
      }
      throw new FootballError('A API não disponibilizou estes dados: cobertura, plano ou limite de consultas.', response.status === 429 ? 429 : 502);
    }
    const fetchedAt = new Date().toISOString();
    await supabaseAdmin.from('football_api_cache').update({ payload, fetched_at: fetchedAt, locked_until: null }).eq('request_key', requestKey);
    return { payload, fetchedAt, cached: false, stale: false };
  } catch (error) {
    await supabaseAdmin.from('football_api_cache').update({ locked_until: null }).eq('request_key', requestKey);
    const old = fallback();
    if (old) return old;
    if (error instanceof FootballError) throw error;
    throw new FootballError('Falha de conexão com a API-Football. Tente mais tarde.', 502);
  }
}

export class FootballError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function footballFailure(error: unknown) {
  return Response.json({ error: error instanceof FootballError ? error.message : 'Dados de futebol indisponíveis.', source: 'API-Football', players: [], clubs: [] }, { status: error instanceof FootballError ? error.status : 503 });
}