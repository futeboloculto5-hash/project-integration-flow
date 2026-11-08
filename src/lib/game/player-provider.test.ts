import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLUBS } from './clubs';
import { createCareer, ensureFields, generateSquad, type CareerV2 } from './career';
import { initializeSeason } from './seasons';
import { transferPlayer } from './transfers';
import { legacyClubs } from './club-provider';
import { composePlayerProviders, createDatapackPlayerProvider, createLegacyPlayerProvider, createPlayerProvider, gameId, legacyPlayers, playersFromDatapack, stableIdForLegacy, toGamePlayer } from './player-provider';
import { testPack } from '@/lib/datapack/fixtures';
import { isValidId } from '@/lib/datapack/ids';
import { createMatch, createTeam, step, type MatchPlayer } from '@/lib/match/engine';

const career = (club = 'flamengo'): CareerV2 => initializeSeason(ensureFields(createCareer('Teste', club)));
const SIMB = Array.from({ length: 20 }, (_, i) => `sim-b-${i + 1}`);
const packWith = (fn: (p: any) => void = () => {}) => { const p: any = structuredClone(testPack()); fn(p); return p; };

describe('Jogadores · dados atuais pelo provedor', () => {
  it('cobre os 20 clubes e a Série B simulada, 22 jogadores cada, sem repetir id', () => {
    const all = legacyPlayers.list();
    expect(all).toHaveLength(40 * 22);
    expect(new Set(all.map(p => p.id)).size).toBe(all.length); expect(new Set(all.map(p => p.legacyId)).size).toBe(all.length);
    for (const id of [...CLUBS.map(c => c.id), ...SIMB]) expect(legacyPlayers.byClub(id)).toHaveLength(22);
  });
  it('os jogadores são idênticos aos que o jogo já gera (mesmos ids, nomes, notas, valores)', () => {
    for (const id of [...CLUBS.map(c => c.id), ...SIMB]) expect(legacyPlayers.byClub(id).map(toGamePlayer)).toEqual(generateSquad(id, legacyClubs.get(id).rating));
  });
  it('cada jogador está ligado ao clube certo e o id antigo continua sendo o id do jogo', () => {
    for (const c of CLUBS) for (const p of legacyPlayers.byClub(c.id)) { expect(p.clubId).toBe(c.id); expect(p.legacyId?.startsWith(`${c.id}-s1-`)).toBe(true); expect(gameId(p)).toBe(p.legacyId); }
    expect(legacyPlayers.list().every(p => legacyClubs.has(p.clubId) || SIMB.includes(p.clubId))).toBe(true);
  });
  it('ids estáveis: válidos no formato do datapack, determinísticos e diferentes do id legado', () => {
    const again = createLegacyPlayerProvider();
    expect(again.list().map(p => p.id)).toEqual(legacyPlayers.list().map(p => p.id));
    for (const p of legacyPlayers.list()) { expect(isValidId('plr', p.id)).toBe(true); expect(p.id).toBe(stableIdForLegacy(p.legacyId!)); expect(p.id).not.toBe(p.legacyId); }
  });
  it('busca por id estável ou legado, existência e erro claro', () => {
    const p = legacyPlayers.byClub('flamengo')[3]!;
    expect(legacyPlayers.find(p.id)).toBe(p); expect(legacyPlayers.find(p.legacyId!)).toBe(p);
    expect(legacyPlayers.has(p.id)).toBe(true); expect(legacyPlayers.has(p.legacyId!)).toBe(true); expect(legacyPlayers.has('nao-existe')).toBe(false);
    expect(legacyPlayers.resolveId(p.legacyId!)).toBe(p.id); expect(legacyPlayers.resolveId(p.id)).toBe(p.id); expect(legacyPlayers.resolveId('x')).toBeNull();
    expect(() => legacyPlayers.get('nao-existe')).toThrow('Jogador não encontrado');
  });
  it('consulta por posição e por nome (sem diferenciar acento nem maiúscula), com limite e ordem', () => {
    const total = (['GOL', 'DEF', 'MEI', 'ATA'] as const).reduce((s, pos) => { const l = legacyPlayers.byPosition(pos); expect(l.every(p => p.pos === pos)).toBe(true); return s + l.length; }, 0);
    expect(total).toBe(legacyPlayers.list().length);
    const sample = legacyPlayers.list().find(p => /[áéíóúãõçê]/i.test(p.name))!;
    const q = sample.name.split(' ')[0]!;
    const plain = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    expect(legacyPlayers.search(plain, 500).map(p => p.id)).toContain(sample.id);
    const lim = legacyPlayers.search('a', 5); expect(lim).toHaveLength(5);
    const names = legacyPlayers.search('silva', 500).map(p => p.name); expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(legacyPlayers.search('   ')).toEqual([]); expect(legacyPlayers.search('zzzzqq')).toEqual([]); expect(legacyPlayers.search('a', 0)).toEqual([]);
  });
  it('não altera os dados dos clubes', () => {
    const before = structuredClone(CLUBS); createLegacyPlayerProvider(); legacyPlayers.list();
    expect(CLUBS).toEqual(before); expect(CLUBS).toHaveLength(20);
  });
});

describe('Jogadores · identidade não muda com transferência', () => {
  it('o id do jogador permanece igual depois de vendido; só o clube na carreira muda', () => {
    const c = career(); const p = c.squad[0]!;
    const base = legacyPlayers.find(p.id)!; expect(base.clubId).toBe('flamengo');
    const r = transferPlayer(c, p.id, 'flamengo', 'bahia', { kind: 'buy', fee: Math.min(1_000_000, p.value), wage: p.wage, months: 24 });
    expect(r.error).toBeUndefined();
    const moved = r.career.otherSquads?.['bahia']?.find(x => x.id === p.id);
    expect(moved?.clubId).toBe('bahia'); expect(r.career.squad.some(x => x.id === p.id)).toBe(false);
    expect(legacyPlayers.find(p.id)).toBe(base); expect(legacyPlayers.find(p.id)!.clubId).toBe('flamengo'); // a base não muda
    expect(legacyPlayers.resolveId(moved!.id)).toBe(base.id); // mesma pessoa, mesmo id estável
  });
});

describe('Jogadores · conversão para o jogador do jogo', () => {
  it('leva idade desconhecida, id da API e potencial; sem eles, não acrescenta campos', () => {
    const base = legacyPlayers.byClub('santos')[0]!;
    expect(Object.keys(toGamePlayer(base)).sort()).toEqual(['age', 'clubId', 'id', 'name', 'pos', 'rating', 'value', 'wage']);
    const full = toGamePlayer({ ...base, ageUnknown: true, apiId: 7, potential: 88 });
    expect(full).toMatchObject({ ageUnknown: true, apiId: 7, potential: 88 });
    expect('ageUnknown' in toGamePlayer({ ...base, ageUnknown: false })).toBe(false);
  });
});

describe('Jogadores · datapack como fonte', () => {
  const asOf = '2026-11-08';
  it('recusa pacote de teste por padrão e aceita só com permissão explícita', () => {
    expect(() => createDatapackPlayerProvider(testPack(), { asOf })).toThrow('TESTE');
    expect(createDatapackPlayerProvider(testPack(), { asOf, allowTestData: true }).list()).toHaveLength(4);
  });
  it('recusa pacote inválido sem carregar nada', () => {
    expect(() => createDatapackPlayerProvider(packWith(p => { p.players[0].clubId = 'club:nao-existe'; }), { asOf, allowTestData: true })).toThrow('Datapack inválido');
    expect(() => createDatapackPlayerProvider(null, { asOf, allowTestData: true })).toThrow('Datapack inválido');
  });
  it('converte posição, nota, clube (via legacyId), agente livre, idade e ids externos', () => {
    const pack = packWith(p => {
      p.clubs[0].legacyId = 'flamengo';
      p.players[0].position = 'ST'; p.players[0].overall = 77; p.players[0].birthDate = '2000-11-09'; delete p.players[0].age; p.players[0].externalIds = { apiFootball: 321 }; p.players[0].potential = 85;
      delete p.players[1].clubId; delete p.players[1].age;
    });
    const list = playersFromDatapack(pack, { asOf, allowTestData: true });
    expect(list[0]).toMatchObject({ pos: 'ATA', rating: 77, clubId: 'flamengo', age: 25, apiId: 321, potential: 85, origin: 'pacote-teste' });
    expect(list[1]).toMatchObject({ clubId: 'livre', age: 24, ageUnknown: true });
    expect(list[2]?.clubId).toBe('teste-002'); // sem legacyId, usa o slug do clube
    expect(list.every(p => Number.isFinite(p.value) && Number.isFinite(p.wage) && p.value >= 0 && p.wage >= 0)).toBe(true); // sem valor no pacote, vale a fórmula do jogo
    expect(gameId(list[0]!)).toBe(list[0]!.id); // jogador novo usa o id estável como id do jogo
  });
  it('o id do jogador do datapack não depende do clube (mudar o clube não muda o id)', () => {
    const a = playersFromDatapack(testPack(), { asOf, allowTestData: true });
    const b = playersFromDatapack(packWith(p => { p.players[0].clubId = 'club:teste-002'; }), { asOf, allowTestData: true });
    expect(b[0]!.id).toBe(a[0]!.id); expect(b[0]!.clubId).not.toBe(a[0]!.clubId);
  });
});

describe('Jogadores · datapack com dados atuais como reserva', () => {
  const asOf = '2026-11-08';
  const pack = packWith(p => { p.clubs[0].legacyId = 'flamengo'; });
  const primary = createDatapackPlayerProvider(pack, { asOf, allowTestData: true });
  const both = composePlayerProviders(primary, legacyPlayers);
  it('o datapack manda nos clubes que cobre; os outros continuam com os dados atuais', () => {
    expect(both.byClub('flamengo').map(p => p.origin)).toEqual(['pacote-teste', 'pacote-teste']);
    expect(both.byClub('bahia')).toHaveLength(22); expect(both.byClub('bahia')).toEqual(legacyPlayers.byClub('bahia'));
    expect(both.list()).toHaveLength(4 + 40 * 22 - 22);
  });
  it('ids antigos de jogadores substituídos continuam resolvendo (saves antigos não quebram), mas saem das listas', () => {
    const old = legacyPlayers.byClub('flamengo')[0]!;
    expect(both.find(old.legacyId!)).toBe(old); expect(both.has(old.id)).toBe(true);
    expect(both.list()).not.toContain(old); expect(both.search(old.name, 500)).not.toContain(old); expect(both.byClub('flamengo')).not.toContain(old);
  });
  it('sem datapack carregado, o provedor combinado é igual ao atual', () => {
    const none = composePlayerProviders(createPlayerProvider('vazio', []), legacyPlayers);
    expect(none.list()).toEqual(legacyPlayers.list());
  });
});

describe('Jogadores · motor de partidas aceita jogadores do provedor', () => {
  const toMatch = (list: { id: string; name: string; pos: MatchPlayer['pos']; rating: number }[]): MatchPlayer[] => list.map((p, i) => ({ id: p.id, name: p.name, pos: p.pos, rating: p.rating, number: i + 1, energy: 100, yellow: false, sentOff: false, goals: 0, form: 6.5 }));
  const play = (home: ReturnType<typeof toMatch>, away: ReturnType<typeof toMatch>) => {
    let st = createMatch(createTeam('A', 'AAA', '#fff', 78, home), createTeam('B', 'BBB', '#000', 74, away), 'seed-fixo');
    for (let i = 0; i < 2000 && !st.finished; i++) { st = step(st); if (st.paused) st = { ...st, paused: false }; } // o motor pausa no intervalo
    return st;
  };
  it('partida com jogadores do provedor termina e é idêntica à feita com os jogadores gerados direto', () => {
    const viaProvider = play(toMatch(legacyPlayers.byClub('flamengo').map(toGamePlayer)), toMatch(legacyPlayers.byClub('bahia').map(toGamePlayer)));
    const direct = play(toMatch(generateSquad('flamengo', 84)), toMatch(generateSquad('bahia', 77)));
    expect(viaProvider.finished).toBe(true); expect(viaProvider.score).toEqual(direct.score); expect(viaProvider.events.length).toBe(direct.events.length); expect(viaProvider.goals).toEqual(direct.goals);
  });
});

describe('Jogadores · dados de teste não entram no jogo real', () => {
  it('os jogadores atuais não têm nada de teste e são todos marcados como simulados', () => {
    expect(legacyPlayers.list().every(p => p.origin === 'legado' && p.dataStatus === 'simulado')).toBe(true);
    expect(legacyPlayers.list().some(p => p.id.includes('teste') || /teste/i.test(p.name) || /teste/i.test(p.clubId))).toBe(false);
  });
  it('nenhum arquivo do jogo (fora de testes) importa as fixtures de teste', () => {
    const root = resolve(__dirname, '../..'); const files: string[] = [];
    const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = resolve(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name)) files.push(p); } };
    walk(root);
    const offenders = files.filter(f => !/\.test\.tsx?$/.test(f) && !/datapack\/fixtures\.ts$/.test(f) && /datapack\/fixtures|from ['"]\.\/fixtures['"]/.test(readFileSync(f, 'utf8')));
    expect(offenders.map(f => f.replace(root, 'src'))).toEqual([]);
  });
});
