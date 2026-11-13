import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importDatapack, findTestMarkers } from './import';
import { sliceByCountry } from './slice';

const text = readFileSync(resolve(__dirname, '../../../datapacks/mundo/datapack.json'), 'utf8');
const r = importDatapack([{ name: 'datapack.json', text }]);
const p = r.pack!;

describe('Datapack final mundo-competicoes-clubes', () => {
  it('importa como pacote real, sem erros, sem marcas de teste e sem jogadores', () => {
    expect(r.report.errors).toBe(0);
    expect(r.status).toBe('new');
    expect(r.report.pack).toMatchObject({ packId: 'mundo-competicoes-clubes', origin: 'comunitario' });
    expect(findTestMarkers(p)).toEqual([]);
    expect(p.players).toEqual([]);
  });
  it('tem as competições por país e as World (sem país), cada uma com o id da API', () => {
    expect(p.countries).toHaveLength(30);
    expect(p.competitions).toHaveLength(454);
    const world = p.competitions.filter((c) => c.countryId === undefined);
    expect(world).toHaveLength(90);
    expect(world.map((c) => c.name)).toEqual(expect.arrayContaining(['UEFA Champions League', 'CONMEBOL Libertadores', 'World Cup']));
    const api = p.competitions.map((c) => (c.externalIds as { apiFootball: number }).apiFootball);
    expect(new Set(api).size).toBe(api.length);
  });
  it('só masculino e adulto: nada de feminino/base na lista, exceto as bases nacionais do Brasil pedidas', () => {
    const bad = p.competitions.filter((c) => /women|femin|femen|\bU-?\d{2}\b/i.test(c.name)).map((c) => c.name);
    expect(bad).toEqual([]);
    const femininas = ['Kvindeliga', 'WK-League', 'Copa de la Reina', 'Elitettan', 'WPSL', 'USL W League', 'USL Super League', 'Northern Super League'];
    expect(p.competitions.filter((c) => femininas.includes(c.name))).toEqual([]);
    expect(p.competitions.find((c) => c.name === 'Brasileirão Sub-20')).toBeTruthy();
    expect(p.competitions.find((c) => c.name === 'Copa São Paulo de Futebol Júnior')).toBeTruthy();
  });
  it('mantém os ids do Brasil do pacote anterior e fatia por país com clubes e edições', () => {
    expect(p.competitions.find((c) => c.id === 'comp:bra-brasileirao-serie-a')).toBeTruthy();
    const br = sliceByCountry(p, { countries: ['ctry:brasil'] });
    expect(br.competitions.length).toBeGreaterThan(30);
    expect(br.editions).toHaveLength(2);
    expect(br.clubs).toHaveLength(40);
  });
  it('as edições com clubes apontam para competições e clubes que existem, sem repetir clube na edição', () => {
    const ids = new Set(p.competitions.map((c) => c.id));
    const clubs = new Set(p.clubs.map((c) => c.id));
    expect(p.editions.length).toBeGreaterThanOrEqual(43);
    for (const e of p.editions) {
      expect(ids.has(e.competitionId)).toBe(true);
      expect(new Set(e.clubIds).size).toBe(e.clubIds.length);
      expect(e.clubIds.every((c) => clubs.has(c))).toBe(true);
    }
    expect(new Set(p.editions.map((e) => e.competitionId)).size).toBe(p.editions.length);
    const countries = new Set(p.countries.map((c) => c.id));
    expect(p.clubs.every((c) => countries.has(c.countryId))).toBe(true);
  });
  it('clubes vindos do API-Football (2024): ligas da China, Canadá, Chile e Angola, sem seleções e sem duplicar por id do API', () => {
    const edition = (name: string) => { const c = p.competitions.find((x) => x.name === name && x.countryId !== undefined)!; return p.editions.find((e) => e.competitionId === c.id); };
    expect(edition('Super League')!.clubIds).toHaveLength(16);
    expect(edition('Girabola')!.clubIds).toHaveLength(16);
    expect(edition('Primera División')!.season).toBe('2024');
    const colo = p.clubs.find((c) => c.name === 'Colo Colo')!;
    expect(colo).toMatchObject({ countryId: 'ctry:chile', externalIds: { apiFootball: 2315 } });
    const apiIds = p.clubs.map((c) => (c.externalIds as { apiFootball?: number } | undefined)?.apiFootball).filter((x) => x !== undefined);
    expect(new Set(apiIds).size).toBe(apiIds.length);
    expect(p.clubs.length).toBeGreaterThan(502);
    expect(p.manifest.counts).toMatchObject({ clubs: p.clubs.length, editions: p.editions.length });
  });
});
