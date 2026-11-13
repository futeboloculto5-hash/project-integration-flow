import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importDatapack, findTestMarkers } from './import';

const text = readFileSync(resolve(__dirname, '../../../datapacks/clubes-por-competicao/datapack.json'), 'utf8');
const r = importDatapack([{ name: 'datapack.json', text }]);

describe('Pacote de clubes por competição (openfootball, CC0)', () => {
  it('importa como pacote real, sem erros, sem marcas de teste e sem jogadores', () => {
    expect(r.report.errors).toBe(0);
    expect(r.status).toBe('new');
    expect(r.pack!.manifest).toMatchObject({ packId: 'clubes-por-competicao', origin: 'comunitario', source: { license: expect.stringContaining('CC0') } });
    expect(findTestMarkers(r.pack!)).toEqual([]);
    expect(r.pack!.players).toEqual([]);
    expect(r.pack!.competitions).toHaveLength(27);
  });
  it('toda edição tem os clubes do próprio país da competição e nenhum clube repetido', () => {
    const p = r.pack!;
    const club = new Map(p.clubs.map((c) => [c.id, c] as const));
    const comp = new Map(p.competitions.map((c) => [c.id, c] as const));
    for (const e of p.editions) {
      expect(new Set(e.clubIds).size).toBe(e.clubIds.length);
      expect(e.clubIds.length).toBeGreaterThanOrEqual(12);
      for (const id of e.clubIds) expect(club.get(id)!.countryId).toBe(comp.get(e.competitionId)!.countryId);
    }
  });
  it('na mesma temporada e país, um clube não está em duas divisões (Apertura e Clausura são metades da mesma liga e têm os mesmos clubes)', () => {
    const p = r.pack!;
    const comp = new Map(p.competitions.map((c) => [c.id, c] as const));
    const seen = new Map<string, string>(); // país|temporada|clube -> competição
    const sameClubs = (a: string, b: string) => { const x = p.editions.find((e) => e.competitionId === a)!.clubIds, y = p.editions.find((e) => e.competitionId === b)!.clubIds; return x.length === y.length && x.every((c) => y.includes(c)); };
    for (const e of p.editions) for (const id of e.clubIds) {
      const k = `${comp.get(e.competitionId)!.countryId}|${e.season}|${id}`;
      const other = seen.get(k);
      if (other) expect(sameClubs(other, e.competitionId), `${id} em ${other} e ${e.competitionId} (${e.season})`).toBe(true);
      seen.set(k, e.competitionId);
    }
  });
  it('confere tamanhos conhecidos e clubes de referência nas competições certas', () => {
    const p = r.pack!;
    const ed = (id: string) => p.editions.find((e) => e.competitionId === id)!;
    const names = (id: string) => ed(id).clubIds.map((c) => p.clubs.find((x) => x.id === c)!.name);
    expect(ed('comp:bra-brasileirao-serie-a').clubIds).toHaveLength(20);
    expect(names('comp:bra-brasileirao-serie-a')).toEqual(expect.arrayContaining(['CR Flamengo', 'SE Palmeiras']));
    expect(names('comp:eng-premier-league')).toEqual(expect.arrayContaining(['Arsenal FC']));
    expect(p.competitions.find((c) => c.name === 'Bundesliga')).toMatchObject({ externalIds: { apiFootball: 78 } });
  });
});
