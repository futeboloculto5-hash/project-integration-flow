import { describe, expect, it } from 'vitest';
import { assignClubs, assignCompetitions, buildCountryPack, parseIdNameCsv } from './club-country';
import { buildCatalog } from './api-football-catalog';
import { importDatapack } from './import';

const teams = {
  Albania: [{ id: 1, name: 'Dinamo City' }, { id: 2, name: 'KF Laçi' }],
  Argentina: [{ id: 10, name: 'Arsenal de Sarandí' }, { id: 11, name: 'Arsenal' }, { id: 12, name: 'Boca Juniors' }],
  Brazil: [{ id: 20, name: 'Flamengo' }, { id: 21, name: 'Palmeiras' }, { id: 99, name: 'Brazil', national: true }],
  England: [{ id: 30, name: 'Arsenal' }, { id: 31, name: 'Chelsea' }],
  Peru: [{ id: 40, name: 'Arsenal' }, { id: 41, name: 'Alianza Lima' }],
};
const rows = (s: string) => parseIdNameCsv(s).rows;

describe('CSV id,nome', () => {
  it('lê CRLF, aspas e BOM; conta linhas inválidas', () => {
    const r = parseIdNameCsv('﻿14,Dinamo City\r\n15,"KF ""X"", Y"\r\nxx,ruim\r\n16,\r\n\r\n');
    expect(r.rows).toEqual([{ id: 14, name: 'Dinamo City' }, { id: 15, name: 'KF "X", Y' }]);
    expect(r.invalid).toBe(2);
  });
});

describe('clubes por país', () => {
  const csv = '14,Dinamo City\n15,KF Laçi\n100,Boca Juniors\n101,Arsenal\n102,Arsenal de Sarandí\n200,Flamengo\n201,Palmeiras\n300,Arsenal\n301,Chelsea\n400,Alianza Lima\n401,Arsenal\n402,Clube Sem Par\n403,Time Seleção\n';
  it('nome único atribui; nome em vários países usa a ordem dos ids; o resto fica pendente com candidatos', () => {
    const a = assignClubs(rows(csv), teams);
    const by = (n: string, id?: number) => a.assigned.find((x) => x.row.name === n && (id === undefined || x.row.id === id));
    expect(by('Flamengo')).toMatchObject({ country: 'Brazil', basis: 'nome' });
    expect(by('Arsenal', 101)).toMatchObject({ country: 'Argentina', basis: 'nome+vizinhança' });
    expect(by('Arsenal', 300)).toMatchObject({ country: 'England', basis: 'nome+vizinhança' });
    expect(by('Arsenal', 401)).toMatchObject({ country: 'Peru', basis: 'nome+vizinhança' });
    expect(a.neighborRule).toBe('ativa');
    expect(a.pending.map((p) => p.row.name)).toEqual(['Clube Sem Par', 'Time Seleção']);
    expect(a.pending[0]).toMatchObject({ reason: 'sem_correspondencia', candidates: [] });
  });
  it('sem a ordem dos ids a ambiguidade NÃO é resolvida (nunca por palpite)', () => {
    const a = assignClubs(rows('1,Arsenal'), teams);
    expect(a.assigned).toEqual([]);
    expect(a.pending[0]).toMatchObject({ reason: 'ambiguo', candidates: ['Argentina', 'England', 'Peru'] });
  });
  it('se a ordem alfabética não se confirma nos dados, a regra de vizinhança é desligada', () => {
    const a = assignClubs(rows('1,Flamengo\n2,Dinamo City\n3,Arsenal\n4,Chelsea'), teams);
    expect(a.neighborRule).toBe('desligada');
    expect(a.pending.find((p) => p.row.name === 'Arsenal')!.reason).toBe('ambiguo');
  });
  it('seleções nacionais do API não viram clubes', () => {
    expect(assignClubs(rows('1,Brazil'), teams).assigned).toEqual([]);
  });
  it('dá pista (não atribui) quando os vizinhos são do mesmo país', () => {
    const a = assignClubs(rows('200,Flamengo\n201,Clube Sem Par\n202,Palmeiras'), teams);
    expect(a.pending[0]).toMatchObject({ hint: 'Brazil' });
    expect(a.assigned).toHaveLength(2);
  });
});

describe('competições por país e pacote final', () => {
  const countries = { response: [{ name: 'Brazil' }, { name: 'Canada' }, { name: 'Chile' }, { name: 'England' }] };
  const L = (id: number, name: string, country: string, type = 'League') => ({ league: { id, name, type }, country: { name: country }, seasons: [{ year: 2024 }] });
  const leagues = { response: [L(71, 'Serie A', 'Brazil'), L(73, 'Copa do Brasil', 'Brazil', 'Cup'), L(300, 'Premier League', 'Canada'), L(39, 'Premier League', 'England'), L(265, 'Primera Division', 'Chile')] };
  const catalog = buildCatalog(countries, leagues);
  const comps = rows('1410,Serie A\n1440,Copa do Brasil\n1610,Premier League\n1670,Primera Division\n2270,Premier League\n9000,Liga Misteriosa');
  it('Premier League duplicada resolve pela posição entre Brasil/Chile e Inglaterra', () => {
    const a = assignCompetitions(comps, catalog);
    expect(a.assigned.find((x) => x.row.id === 1610)).toMatchObject({ country: 'Canada', basis: 'nome+vizinhança' });
    expect(a.assigned.find((x) => x.row.id === 2270)).toMatchObject({ country: 'England', basis: 'nome+vizinhança' });
    expect(a.pending.map((p) => p.row.name)).toEqual(['Liga Misteriosa']);
  });
  it('gera um pacote válido, com ids do API e da lista externa e sem jogadores', () => {
    const clubs = assignClubs(rows('14,Dinamo City\n200,Flamengo\n300,Arsenal\n301,Chelsea\n400,Alianza Lima\n401,Arsenal'), teams);
    const pack = buildCountryPack({ clubs, competitions: assignCompetitions(comps, catalog), catalog, teams, externalKey: 'champholics', packId: 'clubes-competicoes-por-pais', name: 'Clubes e competições por país', now: new Date('2026-11-12T12:00:00Z') });
    const imp = importDatapack([{ name: 'datapack.json', text: JSON.stringify(pack) }]);
    expect(imp.report.errors).toBe(0);
    expect(pack.clubs.map((c) => c.id)).toEqual(['club:dinamo-city', 'club:flamengo', 'club:arsenal', 'club:chelsea', 'club:alianza-lima', 'club:arsenal-peru']);
    expect(pack.clubs[1]).toMatchObject({ countryId: 'ctry:brasil', externalIds: { apiFootball: 20, champholics: 200 } });
    expect(pack.competitions.find((c) => c.name === 'Copa do Brasil')).toMatchObject({ kind: 'cup', countryId: 'ctry:brasil' });
    expect(pack.players).toEqual([]);
    expect(new Set(pack.competitions.map((c) => c.id)).size).toBe(pack.competitions.length);
  });
});
