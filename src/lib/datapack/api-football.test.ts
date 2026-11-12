import { describe, expect, it } from 'vitest';
import { importLeague, mapApiPosition, estimateOverall, resolveCountry, type ApiRead } from './api-football';
import { importDatapack } from './import';
import { sliceByCountry } from './slice';

// Respostas FALSAS no formato documentado do API-Football v3. Ainda não foram conferidas com uma resposta real desta conta.
const NAMES = ['Alfa', 'Beta', 'Gama', 'Delta'];
const POS = ['Goalkeeper', 'Defender', 'Defender', 'Defender', 'Defender', 'Midfielder', 'Midfielder', 'Midfielder', 'Attacker', 'Attacker', 'Attacker', 'Goalkeeper', 'Defender', 'Midfielder'];
const teamsResp = (n = 4) => ({ response: NAMES.slice(0, n).map((name, i) => ({ team: { id: 100 + i, name: `${name} FC`, code: name.slice(0, 3).toUpperCase(), country: 'Brazil' }, venue: { name: `Estádio ${name}`, city: `Cidade ${name}` } })) });
const squadResp = (teamId: number) => ({ response: [{ team: { id: teamId }, players: POS.map((position, i) => ({ id: teamId * 100 + i, name: `Jogador ${teamId}-${i}`, age: 18 + i, number: i + 1, position })) }] });

function fakeRead(opts: { league?: any; teams?: any; cachedSquads?: Set<number>; fail?: (p: string, q: Record<string, string>) => boolean } = {}) {
  const calls: string[] = [];
  const read: ApiRead = async (path, params) => {
    if (opts.fail?.(path, params)) throw new Error('A API não disponibilizou estes dados');
    calls.push(`${path}?${new URLSearchParams(params)}`);
    if (path === 'leagues') return { cached: false, payload: opts.league ?? { response: [{ league: { id: 71, name: 'Serie A', type: 'League' }, country: { name: 'Brazil' } }] } };
    if (path === 'teams') return { cached: false, payload: opts.teams ?? teamsResp() };
    const id = Number(params['team']);
    return { cached: opts.cachedSquads?.has(id) ?? false, payload: squadResp(id) };
  };
  return { read, calls };
}
const run = (o: Partial<Parameters<typeof importLeague>[0]> & { read: ApiRead }) => importLeague({ league: 71, season: 2023, maxCalls: 40, now: () => new Date('2026-11-12T12:00:00Z'), ...o });

describe('importLeague (API-Football, leitura injetada)', () => {
  it('gasta 2 + 1 por clube e monta um pacote que o importador aceita como pacote real', async () => {
    const { read, calls } = fakeRead();
    const r = await run({ read });
    expect(r.status).toBe('complete');
    expect(calls).toHaveLength(2 + 4);
    expect(r.callsUsed).toBe(6);
    const imp = importDatapack([{ name: 'datapack.json', text: JSON.stringify(r.pack) }]);
    expect(imp.report.errors).toBe(0);
    expect(imp.pack!.clubs).toHaveLength(4);
    expect(imp.pack!.players).toHaveLength(4 * POS.length);
    expect(imp.pack!.manifest).toMatchObject({ packId: 'apifootball-71', version: '1.261112.0', origin: 'licenciado' });
  });
  it('liga conhecida e país confirmado usa o id do pacote de competições; país diferente deriva do nome e avisa', async () => {
    const ok = await run({ read: fakeRead().read });
    expect(ok.league).toMatchObject({ competitionId: 'comp:bra-brasileirao-serie-a', knownMapping: true });
    expect(ok.pack!.countries[0]).toMatchObject({ id: 'ctry:brasil', code: 'BRA' });
    const other = await run({ read: fakeRead({ league: { response: [{ league: { id: 71, name: 'Serie A', type: 'League' }, country: { name: 'Italy' } }] } }).read });
    expect(other.league!.knownMapping).toBe(false);
    expect(other.league!.competitionId).toBe('comp:ita-serie-a');
    expect(other.warnings.join(' ')).toContain('esperava o país');
  });
  it('nada é inventado: força é estimativa e marcada, sem fotos, posição desconhecida é descartada', async () => {
    const { read } = fakeRead();
    const r = await run({ read });
    expect(r.pack!.players.every((p) => p.dataStatus === 'estimativa' && p.overall >= 40 && p.overall <= 80)).toBe(true);
    expect(JSON.stringify(r.pack)).not.toMatch(/photo|https?:\/\/media/);
    const odd = fakeRead(); const orig = odd.read;
    const r2 = await run({ read: async (p, q) => { const x = await orig(p, q); if (p === 'players/squads') x.payload.response[0].players[0].position = 'Coach'; return x; } });
    expect(r2.pack!.players).toHaveLength(4 * POS.length - 4);
    expect(r2.warnings.join(' ')).toContain('posição desconhecida');
  });
  it('orçamento curto: para antes de estourar e devolve o que faltou; chamadas em cache não contam', async () => {
    const { read, calls } = fakeRead();
    const r = await run({ read, maxCalls: 4 }); // leagues + teams + 2 elencos
    expect(r.status).toBe('incomplete');
    expect(r.callsUsed).toBe(4);
    expect(calls).toHaveLength(4);
    expect(r.clubs).toMatchObject({ fetched: 2, total: 4, missing: ['Gama FC', 'Delta FC'] });
    expect(r.remaining.teams).toBe(2);
    expect(r.pack).toBeUndefined();
    // Retomada: os dois primeiros elencos agora vêm do cache e não gastam orçamento
    const again = await run({ read: fakeRead({ cachedSquads: new Set([100, 101]) }).read, maxCalls: 4 });
    expect(again.status).toBe('complete');
    expect(again.callsUsed).toBe(4);
    expect(again.cachedCalls).toBe(2);
  });
  it('erro da API no meio (limite/plano) para sem quebrar e informa onde parou', async () => {
    const { read } = fakeRead({ fail: (p, q) => p === 'players/squads' && q['team'] === '102' });
    const r = await run({ read });
    expect(r.status).toBe('incomplete');
    expect(r.clubs.fetched).toBe(2);
    expect(r.warnings.join(' ')).toContain('Parou em "Gama FC"');
  });
  it('sem clubes, sem liga ou falha logo no começo: falha com mensagem clara e sem pacote', async () => {
    expect((await run({ read: fakeRead({ league: { response: [] } }).read })).error).toContain('não devolveu a liga');
    const noTeams = await run({ read: fakeRead({ teams: { response: [] } }).read });
    expect(noTeams.status).toBe('failed'); expect(noTeams.pack).toBeUndefined();
    const dead = await run({ read: fakeRead({ fail: () => true }).read });
    expect(dead.status).toBe('failed'); expect(dead.error).toContain('não disponibilizou');
    expect((await run({ read: fakeRead().read, maxCalls: 1 })).status).toBe('incomplete');
  });
  it('clubes homônimos e jogadores repetidos não colidem; ids de jogador levam o id do API e nunca o clube', async () => {
    const teams = { response: [100, 101].map((id) => ({ team: { id, name: 'Sporting', country: 'Brazil' }, venue: {} })) };
    const r = await run({ read: fakeRead({ teams }).read });
    expect(r.pack!.clubs.map((c) => c.id)).toEqual(['club:sporting', 'club:sporting-101']);
    expect(r.pack!.players[0]!.id).toBe('plr:jogador-100-0-10000');
    expect(importDatapack([{ name: 'datapack.json', text: JSON.stringify(r.pack) }]).report.errors).toBe(0);
  });
  it('país fora da tabela fica em inglês, sem código nem confederação, e avisa', async () => {
    const r = await run({ league: 999, read: fakeRead({ league: { response: [{ league: { id: 999, name: 'Liga X', type: 'League' }, country: { name: 'Wakanda' } }] }, teams: { response: teamsResp().response.map((t) => ({ ...t, team: { ...t.team, country: 'Wakanda' } })) } }).read });
    expect(r.pack!.countries[0]).toEqual({ id: 'ctry:wakanda', name: 'Wakanda', dataStatus: 'pesquisa' });
    expect(r.warnings.join(' ')).toContain('fora da tabela');
    expect(importDatapack([{ name: 'datapack.json', text: JSON.stringify(r.pack) }]).report.errors).toBe(0);
  });
  it('o pacote da liga funde com o de competições sem conflito de país e fatia por país', async () => {
    const r = await run({ read: fakeRead().read });
    expect(sliceByCountry(r.pack!, { countries: ['ctry:brasil'] }).clubs).toHaveLength(4);
  });
  it('funções auxiliares', () => {
    expect(mapApiPosition('Goalkeeper')).toBe('GK'); expect(mapApiPosition('Attacker')).toBe('ST'); expect(mapApiPosition('x')).toBeNull(); expect(mapApiPosition(undefined)).toBeNull();
    expect(estimateOverall(1, 25, 'CM')).toBe(estimateOverall(1, 25, 'CM'));
    expect(resolveCountry('South Korea')!.country.id).toBe('ctry:coreia-do-sul');
    expect(resolveCountry('')).toBeNull();
  });
});
