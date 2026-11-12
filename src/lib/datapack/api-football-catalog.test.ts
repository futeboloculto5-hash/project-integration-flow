import { describe, expect, it } from 'vitest';
import { buildCatalog, fetchCatalog } from './api-football-catalog';

// Respostas FALSAS no formato documentado; ainda não conferidas com resposta real.
const countries = { response: [{ name: 'Brazil', code: 'BR' }, { name: 'Colombia', code: 'CO' }, { name: 'Peru', code: 'PE' }] };
const L = (id: number, name: string, type: string, country: string | null, years: number[], cur = false) => ({ league: { id, name, type }, country: { name: country, code: null }, seasons: years.map((y, i) => ({ year: y, current: cur && i === years.length - 1 })) });
const leagues = { response: [L(72, 'Serie B', 'League', 'Brazil', [2020, 2023]), L(71, 'Serie A', 'League', 'Brazil', [2018, 2024], true), L(73, 'Copa do Brasil', 'Cup', 'Brazil', [2022]), L(239, 'Primera A', 'League', 'Colombia', [2024]), L(2, 'Champions', 'Cup', null, [2024]), { league: { id: 0 } }] };

describe('catálogo de países e competições do API-Football', () => {
  it('agrupa por país, ordena, classifica o tipo e resume temporadas', () => {
    const c = buildCatalog(countries, leagues);
    expect(c.countries.map((x) => x.name)).toEqual(['Brazil', 'Colombia', 'Peru', 'World']);
    const br = c.countries[0]!;
    expect(br.leagues.map((l) => l.id)).toEqual([71, 72, 73]);
    expect(br.leagues[0]).toEqual({ id: 71, name: 'Serie A', type: 'league', firstSeason: 2018, lastSeason: 2024, current: true });
    expect(br.leagues[2]!.type).toBe('cup');
    expect(c.countries.find((x) => x.name === 'World')!.leagues[0]!.name).toBe('Champions');
    expect(c.totals).toEqual({ countries: 4, leagues: 5 });
    expect(c.warnings.join(' ')).toContain('1 competição');
  });
  it('filtra por país e não inventa países sem competição', () => {
    const c = buildCatalog(countries, leagues, ['brazil', 'Colombia', 'Peru']);
    expect(c.countries.map((x) => x.name)).toEqual(['Brazil', 'Colombia']);
  });
  it('respostas vazias ou estranhas não quebram', () => {
    expect(buildCatalog(undefined, null).totals).toEqual({ countries: 0, leagues: 0 });
  });
  it('gasta no máximo 2 chamadas e não conta as que vieram do cache', async () => {
    let n = 0;
    const read = async (p: string) => { n++; return { cached: p === 'countries', payload: p === 'countries' ? countries : leagues }; };
    const r = await fetchCatalog(read);
    expect(n).toBe(2); expect(r.callsUsed).toBe(1);
  });
});
