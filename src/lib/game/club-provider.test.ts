import { describe, expect, it } from 'vitest';
import { CLUBS, clubById } from './clubs';
import { createLegacyClubProvider, datapackClubId, legacyClubs, toPackClub } from './club-provider';
import { validateDatapack } from '@/lib/datapack/validate';
import type { Datapack } from '@/lib/datapack/types';

const ids = CLUBS.map(c => c.id);
const capture = (fn: () => unknown) => { try { return { value: fn() }; } catch (e) { return { error: (e as Error).message }; } };

describe('Clubes · camada nova x código antigo', () => {
  it('todos os clubes atuais continuam disponíveis, na mesma ordem e com os mesmos objetos', () => {
    expect(legacyClubs.list()).toHaveLength(CLUBS.length); expect(CLUBS).toHaveLength(20);
    legacyClubs.list().forEach((c, i) => expect(c).toBe(CLUBS[i]));
    for (const id of ids) { expect(legacyClubs.has(id)).toBe(true); expect(legacyClubs.find(id)).toBe(CLUBS.find(c => c.id === id)); }
  });
  it('get devolve exatamente o que clubById devolve (mesma referência) para os 20 clubes', () => {
    for (const id of ids) expect(legacyClubs.get(id)).toBe(clubById(id));
  });
  it('Série B simulada (sim-b-N) é idêntica ao código antigo', () => {
    for (let n = 1; n <= 20; n++) expect(legacyClubs.get(`sim-b-${n}`)).toEqual(clubById(`sim-b-${n}`));
    expect(legacyClubs.has('sim-b-3')).toBe(false); expect(legacyClubs.find('sim-b-3')).toBeUndefined(); // find/has não inventam clubes
  });
  it('id desconhecido: mesmo erro do código antigo; find devolve undefined', () => {
    for (const bad of ['nao-existe', '', 'FLAMENGO', 'sim-b-', 'sim-b-x', 'flamengo ']) {
      expect(capture(() => legacyClubs.get(bad))).toEqual(capture(() => clubById(bad)));
      expect(legacyClubs.get.bind(null, bad)).toThrow('Clube não encontrado'); expect(legacyClubs.find(bad)).toBeUndefined(); expect(legacyClubs.has(bad)).toBe(false);
    }
  });
  it('ids e dados dos clubes atuais não mudaram (fotografia dos ids)', () => {
    expect(ids).toEqual(['atletico-mg', 'bahia', 'botafogo', 'ceara', 'corinthians', 'cruzeiro', 'flamengo', 'fluminense', 'fortaleza', 'gremio', 'internacional', 'juventude', 'mirassol', 'palmeiras', 'bragantino', 'santos', 'sao-paulo', 'sport', 'vasco', 'vitoria']);
    expect(Object.keys(clubById('flamengo')).sort()).toEqual(['apiId', 'budget', 'capacity', 'city', 'color', 'color2', 'debt', 'id', 'master', 'name', 'rating', 'short', 'stadium']);
  });
  it('a camada não altera nem congela os dados originais', () => {
    const before = structuredClone(CLUBS);
    legacyClubs.list(); legacyClubs.get('flamengo'); toPackClub(CLUBS[0]!);
    expect(CLUBS).toEqual(before); expect(Object.isFrozen(CLUBS)).toBe(false);
  });
  it('provedor sobre lista de teste: duplicata vale o primeiro, como o find antigo', () => {
    const a = { ...CLUBS[0]! }, b = { ...CLUBS[0]!, name: 'Outro' };
    const p = createLegacyClubProvider([a, b]);
    expect(p.get(a.id)).toBe(a); expect(p.list()).toHaveLength(2);
  });
});

describe('Clubes · ponte para o formato do datapack', () => {
  it('ids novos são determinísticos, únicos e guardam o id antigo em legacyId', () => {
    const packIds = ids.map(datapackClubId);
    expect(new Set(packIds).size).toBe(ids.length); expect(datapackClubId('sao-paulo')).toBe('club:sao-paulo');
    expect(CLUBS.map(c => toPackClub(c).legacyId)).toEqual(ids);
  });
  it('os 20 clubes atuais, descritos no formato novo, formam um datapack válido', () => {
    const pack: Datapack = {
      manifest: { schema: 'ccw.datapack', schemaVersion: 1, packId: 'jogo-atual', version: '1.0.0', name: 'Clubes atuais (teste de ponte)', createdAt: '2026-11-08', origin: 'teste', counts: { countries: 1, competitions: 0, clubs: 20, players: 0, editions: 0 } },
      countries: [{ id: 'ctry:brasil', name: 'Brasil', code: 'BRA' }], competitions: [], editions: [], players: [],
      clubs: CLUBS.map(c => toPackClub(c)),
    };
    const r = validateDatapack(pack);
    expect(r.issues.filter(i => i.severity === 'error').map(i => `${i.path}: ${i.message}`)).toEqual([]); expect(r.ok).toBe(true);
  });
  it('a conversão preserva nome, cores, força e id da API', () => {
    for (const c of CLUBS) { const p = toPackClub(c); expect(p.name).toBe(c.name); expect(p.colors).toEqual([c.color, c.color2]); expect(p.rating).toBe(c.rating); expect(p.externalIds).toEqual({ apiFootball: c.apiId }); }
  });
});
