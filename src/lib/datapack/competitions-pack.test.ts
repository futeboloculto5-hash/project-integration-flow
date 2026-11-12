import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importDatapack, findTestMarkers } from './import';
import { sliceByCountry, catalogByCountry } from './slice';

const text = readFileSync(resolve(__dirname, '../../../datapacks/competicoes-por-pais/datapack.json'), 'utf8');
const files = [{ name: 'datapack.json', text }];

describe('Pacote de competições por país', () => {
  it('importa sem erros, como pacote real (fonte e licença declaradas, sem marcas de teste)', () => {
    const r = importDatapack(files);
    expect(r.report.errors).toBe(0);
    expect(r.status).toBe('new');
    expect(r.report.pack).toMatchObject({ packId: 'competicoes-por-pais', origin: 'comunitario', countries: 28 });
    expect(r.pack!.competitions).toHaveLength(86);
    expect(findTestMarkers(r.pack!)).toEqual([]);
  });
  it('toda competição pertence a um país e nada traz id, imagem ou dado de terceiros', () => {
    const p = importDatapack(files).pack!;
    const countries = new Set(p.countries.map((c) => c.id));
    expect(p.competitions.every((c) => c.countryId && countries.has(c.countryId))).toBe(true);
    expect(p.competitions.every((c) => c.externalIds === undefined && c.dataStatus === 'pesquisa')).toBe(true);
    expect(p.clubs).toHaveLength(0); expect(p.players).toHaveLength(0);
  });
  it('separa por país e continua sendo um pacote válido', () => {
    const p = importDatapack(files).pack!;
    const br = sliceByCountry(p, { countries: ['ctry:brasil'] });
    expect(br.competitions.map((c) => c.name)).toEqual(expect.arrayContaining(['Brasileirão Série A', 'Copa do Brasil', 'Campeonato Paulista']));
    expect(br.competitions).toHaveLength(13);
    expect(catalogByCountry(p).find((c) => c.countryId === 'ctry:inglaterra')!.competitions).toBe(8);
    expect(importDatapack([{ name: 'datapack.json', text: JSON.stringify(br) }]).report.errors).toBe(0); // a fatia também é um pacote válido
  });
  it('os nomes confirmados entraram no país certo e os de países ainda fora do pacote não', () => {
    const p = importDatapack(files).pack!;
    const of = (n: string) => p.competitions.find((c) => c.name === n)?.countryId;
    expect(of('Superliga')).toBe('ctry:dinamarca'); expect(of('Campeonato Primera B')).toBe('ctry:chile'); expect(of('Liga 1')).toBe('ctry:peru'); expect(of('Liga 2')).toBe('ctry:peru');
  });
  it('os nomes ambíguos não foram incluídos', () => {
    const names = importDatapack(files).pack!.competitions.map((c) => c.name);
    for (const n of ['Primera A', 'Primera B', 'Division Profesional', 'Division Intermedia']) expect(names).not.toContain(n);
  });
});
