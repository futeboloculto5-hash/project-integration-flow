import { describe, expect, it } from 'vitest';
import { decide, filterCatalog, fixCase } from './competition-filter';
import type { CatalogLeague } from './api-football-catalog';

const L = (name: string, type: 'league' | 'cup' = 'league'): CatalogLeague => ({ id: 1, name, type });
const kept = (c: string, n: string) => { const d = decide(c, L(n)); return d.keep ? d.name : `X:${d.reason}`; };

describe('filtro do catálogo (masculino, adulto, estaduais só 1ª divisão)', () => {
  it('Brasil: nomes de jogo e só a 1ª divisão dos estaduais', () => {
    expect(kept('Brazil', 'Serie A')).toBe('Brasileirão Série A');
    expect(kept('Brazil', 'Copa Do Brasil')).toBe('Copa do Brasil');
    expect(kept('Brazil', 'Paulista - A1')).toBe('Campeonato Paulista');
    expect(kept('Brazil', 'Gaúcho - 1')).toBe('Campeonato Gaúcho');
    expect(kept('Brazil', 'Alagoano')).toBe('Campeonato Alagoano');
    expect(kept('Brazil', 'Sul-Matogrossense')).toBe('Campeonato Sul-Matogrossense');
    for (const n of ['Paulista - A2', 'Paulista - A3', 'Carioca - 2', 'Carioca A2', 'Carioca B2', 'Mineiro - 3', 'Paraibano 2', 'Matogrossense 2', 'Paulista Série B', 'Copa Paulista', 'Copa Rio', 'Copa Fares Lopes']) expect(kept('Brazil', n)).toMatch(/^X:/);
  });
  it('Brasil: categorias de base nacionais continuam, com nome de jogo; as estaduais de base não', () => {
    expect(kept('Brazil', 'Brasileiro U20 A')).toBe('Brasileirão Sub-20');
    expect(kept('Brazil', 'Brasileiro U17')).toBe('Brasileirão Sub-17');
    expect(kept('Brazil', 'Copa do Brasil U20')).toBe('Copa do Brasil Sub-20');
    expect(kept('Brazil', 'Brasileiro de Aspirantes')).toBe('Brasileirão de Aspirantes');
    expect(kept('Brazil', 'São Paulo Youth Cup')).toBe('Copa São Paulo de Futebol Júnior');
    expect(kept('Brazil', 'Paulista - U20')).toMatch(/^X:/);
    expect(kept('Brazil', 'Brasileiro Women')).toMatch(/^X:/);
  });
  it('tira feminino e base/reservas em qualquer país, sem tirar nomes comuns', () => {
    for (const n of ['Brasileiro Women', 'FA WSL', 'Liga MX Femenil', 'Frauen-Bundesliga', 'Division 1 Féminine', 'Brasileiro U20 A', 'Copa do Brasil U17', 'Campionato Primavera 1', 'Primera División Femenina', 'Copa America Femenina', 'SheBelieves Cup', 'Kvindeliga', 'WK-League', 'Copa de la Reina', 'Elitettan', 'WPSL', 'USL W League', 'USL Super League', 'Northern Super League', 'Premier League 2 Division One']) { expect(kept('X', n)).toMatch(/^X:/); }
    for (const n of ['Premier League', 'Bundesliga', 'Serie A', 'Super Lig', 'Ligue 1', 'Premier League 2025', 'Primera División']) expect(kept('X', n)).toBe(n);
  });
  it('tira futsal, amistosos e copas de rei', () => {
    for (const n of ['Friendlies', 'Club Friendlies', 'Futsal Liga', 'Kings Cup', 'Asian Games', 'National League - Play-offs']) expect(kept('X', n)).toMatch(/^X:/);
  });
  it('arruma maiúsculas de ligações sem mexer no começo do nome', () => {
    expect(fixCase('Copa De La Liga')).toBe('Copa de la Liga');
    expect(fixCase('De Graafschap')).toBe('De Graafschap');
  });
  it('filtra o catálogo inteiro, lista o que saiu com o motivo e some país que ficou sem nada', () => {
    const f = filterCatalog({ countries: [{ name: 'Brazil', leagues: [L('Serie A'), L('Brasileiro Women')] }, { name: 'Aruba', leagues: [L('Liga Women')] }], totals: { countries: 2, leagues: 3 }, warnings: [] });
    expect(f.countries.map((c) => c.name)).toEqual(['Brazil']);
    expect(f.kept).toBe(1);
    expect(f.removed.map((r) => r.reason)).toEqual(['feminino', 'feminino']);
  });
});
