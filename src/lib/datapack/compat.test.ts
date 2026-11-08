import { describe, expect, it } from 'vitest';
import { CLUBS } from '@/lib/game/clubs';
import type { Pos } from '@/lib/game/career';
import { makeId, positionToLegacy, validateDatapack, POSITIONS, type Datapack } from './index';

// Prova de compatibilidade: os 20 clubes que o jogo já tem hoje cabem no contrato, sem perder o id atual.
// O pacote é montado no teste a partir de `CLUBS` (dados já existentes); nada é importado de fora nem inventado.
function packFromCurrentGame(): Datapack {
  return {
    manifest: { schema: 'ccw.datapack', schemaVersion: 1, packId: 'jogo-atual', version: '1.0.0', name: 'Clubes atuais do jogo (teste de compatibilidade)', createdAt: '2026-11-08', origin: 'teste', counts: { countries: 1, competitions: 1, clubs: CLUBS.length, players: 0, editions: 1 } },
    countries: [{ id: 'ctry:brasil', name: 'Brasil', code: 'BRA', confederation: 'CONMEBOL' }],
    competitions: [{ id: 'comp:br-serie-a', name: 'Brasileirão Série A', countryId: 'ctry:brasil', kind: 'league', tier: 1, legacyDivision: 'A' }],
    editions: [{ competitionId: 'comp:br-serie-a', season: '2025', clubIds: CLUBS.map(c => makeId('club', c.id) as `club:${string}`) }],
    clubs: CLUBS.map(c => ({
      id: makeId('club', c.id) as `club:${string}`, name: c.name, short: c.short, countryId: 'ctry:brasil' as const, city: c.city, stadium: c.stadium,
      colors: [c.color, c.color2] as [string, string], rating: c.rating, legacyId: c.id, externalIds: { apiFootball: c.apiId },
    })),
    players: [],
  };
}

describe('Datapack · compatibilidade com a estrutura atual', () => {
  const pack = packFromCurrentGame();
  it('os clubes atuais do jogo são um datapack válido', () => {
    const r = validateDatapack(pack);
    expect(r.issues.filter(i => i.severity === 'error').map(i => `${i.path}: ${i.message}`)).toEqual([]); expect(r.ok).toBe(true);
  });
  it('cada clube atual mantém o id antigo em legacyId (os saves continuam apontando para ele)', () => {
    expect(pack.clubs.map(c => c.legacyId)).toEqual(CLUBS.map(c => c.id));
    expect(new Set(pack.clubs.map(c => c.id)).size).toBe(CLUBS.length);
  });
  it('o rating e as cores atuais cabem nas faixas do contrato', () => {
    for (const c of CLUBS) { expect(c.rating).toBeGreaterThanOrEqual(1); expect(c.rating).toBeLessThanOrEqual(100); expect(c.color).toMatch(/^#[0-9a-fA-F]{6}$/); expect(c.color2).toMatch(/^#[0-9a-fA-F]{6}$/); }
  });
  it('as posições do contrato convertem para o tipo Pos do jogo', () => {
    const all: Pos[] = POSITIONS.map(positionToLegacy);
    expect(new Set(all)).toEqual(new Set(['GOL', 'DEF', 'MEI', 'ATA']));
  });
  it('a divisão A do jogo atual tem ponte via legacyDivision', () => {
    expect(pack.competitions[0]?.legacyDivision).toBe('A');
  });
});
