import { describe, expect, it } from 'vitest';
import { mergeApiClubs } from './api-clubs';
import { importDatapack } from './import';
import type { Datapack } from './types';

// Formato igual ao das respostas reais de `teams?league=ID&season=ANO` (clubes_1.zip).
const team = (id: number, name: string, country: string, extra: object = {}) => ({ team: { id, name, code: name.slice(0, 3).toUpperCase(), country, national: false, logo: 'x' }, venue: { id: id * 10, name: `Estádio ${name}`, city: `Cidade ${name}` }, ...extra });
const file = (league: number, season: number, response: unknown[]) => ({ name: `clubes/${league}_${season}.json`, json: { get: 'teams', parameters: { league: String(league), season: String(season) }, errors: [], results: response.length, response } });
const many = (start: number, n: number, country: string, prefix: string) => Array.from({ length: n }, (_, i) => team(start + i, `${prefix} ${i + 1}`, country));

const base = (): Datapack => ({
  manifest: { schema: 'ccw.datapack', schemaVersion: 1, packId: 'mundo-teste-real', version: '1.0.0', name: 'Base', createdAt: '2026-11-12', origin: 'comunitario', source: { name: 'x', license: 'y' }, counts: { countries: 2, competitions: 4, clubs: 1, players: 0, editions: 1 } },
  countries: [{ id: 'ctry:chile', name: 'Chile', code: 'CHL', confederation: 'CONMEBOL' }, { id: 'ctry:brasil', name: 'Brasil', code: 'BRA', confederation: 'CONMEBOL' }],
  competitions: [
    { id: 'comp:chl-primera-division', name: 'Primera División', countryId: 'ctry:chile', kind: 'league', externalIds: { apiFootball: 265 } },
    { id: 'comp:chl-copa-chile', name: 'Copa Chile', countryId: 'ctry:chile', kind: 'cup', externalIds: { apiFootball: 267 } },
    { id: 'comp:bra-brasileirao-serie-a', name: 'Brasileirão Série A', countryId: 'ctry:brasil', kind: 'league', externalIds: { apiFootball: 71 } },
    { id: 'comp:int-libertadores', name: 'CONMEBOL Libertadores', kind: 'cup', externalIds: { apiFootball: 13 } },
  ],
  editions: [{ competitionId: 'comp:bra-brasileirao-serie-a', season: '2026', clubIds: ['club:cr-flamengo'] }],
  clubs: [{ id: 'club:cr-flamengo', name: 'CR Flamengo', countryId: 'ctry:brasil' }],
  players: [],
});

describe('junção dos clubes do API-Football ao datapack', () => {
  it('cria clubes e edição por competição, com país, estádio e id do API; o mesmo clube em liga e copa é um só', () => {
    const { pack, report } = mergeApiClubs(base(), [file(265, 2024, many(100, 16, 'Chile', 'Time')), file(267, 2024, [...many(100, 10, 'Chile', 'Time'), ...many(500, 5, 'Chile', 'Amador')])]);
    expect(report).toMatchObject({ filesUsed: 2, editionsAdded: 2, clubsAdded: 21 });
    expect(pack.clubs.filter((c) => c.countryId === 'ctry:chile')).toHaveLength(21);
    expect(pack.editions.find((e) => e.competitionId === 'comp:chl-primera-division')).toMatchObject({ season: '2024' });
    expect(pack.clubs.find((c) => c.name === 'Time 1')).toMatchObject({ externalIds: { apiFootball: 100 }, stadium: 'Estádio Time 1', city: 'Cidade Time 1', short: 'TIM' });
  });
  it('seleções não entram; clubes de outros países criam o país; continental fica com clubes de vários países', () => {
    const r = [team(1, 'Boca Juniors', 'Argentina'), team(2, 'Flamengo', 'Brazil'), team(3, 'Colo-Colo', 'Chile'), team(4, 'Brazil', 'Brazil', {}), team(5, 'Millonarios', 'Colombia'), team(6, 'Wakanda FC', 'Wakanda')];
    r[3]!.team.national = true;
    const { pack } = mergeApiClubs(base(), [file(13, 2024, r)]);
    const e = pack.editions.find((x) => x.competitionId === 'comp:int-libertadores')!;
    expect(e.clubIds).toHaveLength(5);
    expect(pack.clubs.find((c) => c.name === 'Brazil')).toBeUndefined();
    expect(pack.clubs.find((c) => c.name === 'Boca Juniors')!.countryId).toBe('ctry:argentina');
    expect(pack.clubs.find((c) => c.name === 'Millonarios')!.countryId).toBe('ctry:colombia');
    expect(pack.clubs.find((c) => c.name === 'Wakanda FC')!.countryId).toBe('ctry:wakanda');
    expect(pack.countries.map((c) => c.id)).toEqual(expect.arrayContaining(['ctry:argentina', 'ctry:wakanda']));
  });
  it('edição existente mais nova (openfootball 2026) não é trocada por uma mais velha (API 2024); a mais nova do API troca', () => {
    const a = mergeApiClubs(base(), [file(71, 2024, many(900, 20, 'Brazil', 'Brasil'))]);
    expect(a.report).toMatchObject({ editionsKeptExisting: 1, editionsReplaced: 0 });
    expect(a.pack.editions.find((e) => e.competitionId === 'comp:bra-brasileirao-serie-a')!.clubIds).toEqual(['club:cr-flamengo']);
    expect(a.pack.clubs.some((c) => c.name === 'Brasil 1')).toBe(false); // clube novo que ninguém cita não entra
    const b = mergeApiClubs(base(), [file(71, 2027, many(900, 20, 'Brazil', 'Brasil'))]);
    expect(b.report).toMatchObject({ editionsReplaced: 1 });
    expect(b.pack.clubs.some((c) => c.name === 'CR Flamengo')).toBe(false); // o antigo saiu
  });
  it('nomes iguais em países diferentes ganham ids diferentes; possíveis duplicados entre fontes só são listados', () => {
    const { pack, report } = mergeApiClubs(base(), [file(265, 2024, [team(1, 'Universidad', 'Chile')]), file(13, 2024, [team(2, 'Universidad', 'Peru')]), file(71, 2024, [team(3, 'Flamengo', 'Brazil')])]);
    const ids = pack.clubs.filter((c) => c.name === 'Universidad').map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
    expect(report.possibleDuplicates).toEqual([]); // Flamengo só entrou na edição que foi mantida => não é citado
  });
  it('arquivos fora do padrão, desconhecidos, com erro ou vazios são pulados com motivo', () => {
    const { report } = mergeApiClubs(base(), [{ name: 'x.json', json: {} }, file(9999, 2024, many(1, 5, 'Chile', 'T')), { name: 'clubes/265_2024.json', json: { errors: { plan: 'x' }, response: [] } }, file(267, 2024, [])]);
    const reasons = report.skipped.map((s) => s.reason).join(' | ');
    expect(report.skipped).toHaveLength(4);
    for (const w of ['padrão', 'não existe', 'erro', 'nenhum clube']) expect(reasons).toContain(w);
  });
  it('o resultado é um datapack válido para o importador', () => {
    const { pack } = mergeApiClubs(base(), [file(265, 2024, many(100, 16, 'Chile', 'Time')), file(13, 2024, [...many(300, 12, 'Argentina', 'Arg'), ...many(400, 4, 'Brazil', 'Bra')])]);
    const r = importDatapack([{ name: 'datapack.json', text: JSON.stringify(pack) }]);
    expect(r.report.errors).toBe(0);
  });
});
