import { describe, expect, it } from 'vitest';
import { sliceByCountry, sliceByCompetition, catalogByCountry } from './slice';
import { validateDatapack } from './validate';
import type { Datapack } from './types';

/** Mundo SINTÉTICO: 3 países (2 confederações), 1 liga por país e 1 copa internacional. Só para testes. */
function syntheticWorld(clubsPerCountry = 4, playersPerClub = 14): Datapack {
  const ctry = [{ id: 'ctry:pa', name: 'País A', confederation: 'CONMEBOL' as const }, { id: 'ctry:pb', name: 'País B', confederation: 'CONMEBOL' as const }, { id: 'ctry:pc', name: 'País C', confederation: 'UEFA' as const }];
  const clubs: Datapack['clubs'] = [], players: Datapack['players'] = [];
  for (const c of ctry) {
    for (let i = 1; i <= clubsPerCountry; i++) {
      const cid = `club:${c.id.slice(5)}-${i}` as const;
      clubs.push({ id: cid, name: `Clube ${c.id.slice(5)} ${i}`, countryId: c.id as `ctry:${string}` });
      for (let j = 1; j <= playersPerClub; j++) players.push({ id: `plr:${c.id.slice(5)}-${i}-${j}`, name: `Jogador ${c.id.slice(5)}-${i}-${j}`, position: 'CM', clubId: cid, overall: 50, age: 25, nationalityId: c.id as `ctry:${string}` });
    }
  }
  // um agente livre de cada país e um jogador de A que joga em B (nacionalidade ≠ país do clube)
  for (const c of ctry) players.push({ id: `plr:livre-${c.id.slice(5)}`, name: `Livre ${c.id.slice(5)}`, position: 'ST', overall: 50, age: 30, nationalityId: c.id as `ctry:${string}` });
  players.push({ id: 'plr:expat-a-em-b', name: 'Expat', position: 'ST', clubId: 'club:pb-1', overall: 60, age: 28, nationalityId: 'ctry:pa' });
  const competitions: Datapack['competitions'] = [
    ...ctry.map((c) => ({ id: `comp:liga-${c.id.slice(5)}` as const, name: `Liga ${c.id.slice(5)}`, countryId: c.id as `ctry:${string}`, kind: 'league' as const, tier: 1 })),
    { id: 'comp:copa-sul', name: 'Copa Internacional', kind: 'cup' as const },
  ];
  const editions: Datapack['editions'] = [
    ...ctry.map((c) => ({ competitionId: `comp:liga-${c.id.slice(5)}` as const, season: '2026', clubIds: clubs.filter((k) => k.countryId === c.id).map((k) => k.id) })),
    { competitionId: 'comp:copa-sul', season: '2026', clubIds: ['club:pa-1', 'club:pb-1', 'club:pc-1'] },
  ];
  return {
    manifest: { schema: 'ccw.datapack', schemaVersion: 1, packId: 'mundo-sintetico', version: '1.0.0', name: 'Mundo sintético de teste', createdAt: '2026-11-09', origin: 'teste', counts: { countries: 3, competitions: competitions.length, clubs: clubs.length, players: players.length, editions: editions.length } },
    countries: ctry, competitions, editions, clubs, players,
  };
}

const ok = (p: Datapack) => { const v = validateDatapack(p); expect(v.issues.filter((i) => i.severity === 'error')).toEqual([]); expect(v.ok).toBe(true); };

describe('Fatias do datapack', () => {
  const world = syntheticWorld();
  it('o mundo sintético é válido', () => ok(world));
  it('fatia por país: só clubes, jogadores e ligas daquele país, e continua válida', () => {
    const s = sliceByCountry(world, { countries: ['ctry:pa'] });
    ok(s);
    expect(s.clubs.map((c) => c.countryId)).toEqual(Array(4).fill('ctry:pa'));
    expect(s.players.filter((p) => p.clubId).every((p) => p.clubId!.startsWith('club:pa-'))).toBe(true);
    expect(s.players.some((p) => p.id === 'plr:livre-pa')).toBe(true); // agente livre do país
    expect(s.players.some((p) => p.id === 'plr:livre-pb')).toBe(false);
    expect(s.competitions.map((c) => c.id)).toEqual(['comp:liga-pa']); // copa internacional fica de fora
    expect(s.manifest.counts).toEqual({ countries: 1, competitions: 1, clubs: 4, players: 4 * 14 + 1, editions: 1 });
  });
  it('jogador de um país que atua em outro é carregado com o clube dele, e o país dele entra por referência', () => {
    const s = sliceByCountry(world, { countries: ['ctry:pb'] });
    ok(s);
    expect(s.players.some((p) => p.id === 'plr:expat-a-em-b')).toBe(true);
    expect(s.countries.map((c) => c.id).sort()).toEqual(['ctry:pa', 'ctry:pb']);
  });
  it('fatia por região (confederação)', () => {
    const s = sliceByCountry(world, { confederations: ['CONMEBOL'] });
    ok(s);
    expect(s.countries.map((c) => c.id).sort()).toEqual(['ctry:pa', 'ctry:pb']);
    expect(s.clubs).toHaveLength(8);
  });
  it('competição internacional só entra se pedida, com os participantes que estiverem na fatia', () => {
    const s = sliceByCountry(world, { countries: ['ctry:pa'], includeInternational: true });
    ok(s);
    const copa = s.editions.find((e) => e.competitionId === 'comp:copa-sul')!;
    expect(copa.clubIds).toEqual(['club:pa-1']);
  });
  it('fatia por competição e temporada', () => {
    const s = sliceByCompetition(world, 'comp:copa-sul', '2026');
    ok(s);
    expect(s.clubs.map((c) => c.id)).toEqual(['club:pa-1', 'club:pb-1', 'club:pc-1']);
    expect(s.editions).toHaveLength(1);
    expect(sliceByCompetition(world, 'comp:copa-sul', '1999').clubs).toHaveLength(0);
    expect(sliceByCompetition(world, 'comp:nao-existe').competitions).toHaveLength(0);
  });
  it('país selecionado com competição mas sem clubes continua referenciado (fatia válida)', () => {
    const w = JSON.parse(JSON.stringify(world)) as Datapack;
    w.countries.push({ id: 'ctry:pd', name: 'País D' });
    w.competitions.push({ id: 'comp:liga-pd', name: 'Liga pd', countryId: 'ctry:pd', kind: 'league', tier: 1 });
    w.manifest.counts.countries++; w.manifest.counts.competitions++;
    const s = sliceByCountry(w, { countries: ['ctry:pd'] });
    ok(s);
    expect(s.countries.map((c) => c.id)).toEqual(['ctry:pd']);
    expect(s.competitions.map((c) => c.id)).toEqual(['comp:liga-pd']);
  });
  it('não altera o pacote original', () => {
    const before = JSON.stringify(world);
    sliceByCountry(world, { countries: ['ctry:pa'], includeInternational: true });
    sliceByCompetition(world, 'comp:copa-sul');
    expect(JSON.stringify(world)).toBe(before);
  });
  it('catálogo por país sem carregar jogadores de cada um', () => {
    const cat = catalogByCountry(world);
    expect(cat.find((c) => c.countryId === 'ctry:pa')).toMatchObject({ clubs: 4, players: 56, competitions: 1, confederation: 'CONMEBOL' });
    expect(cat.find((c) => c.countryId === 'ctry:pb')!.players).toBe(57); // inclui o expatriado, que joga lá
  });
});
