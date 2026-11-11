import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLUBS } from './clubs';
import { SOURCES, SPONSOR_MAP_2025, SECTOR_WEIGHTS_2025, SPONSOR_COMPANIES, STAFF_SALARY_IBGE_2024 } from './finance-data';
import { legacyClubs } from './club-provider';
import { legacyPlayers, toGamePlayer, type PlayerProvider } from './player-provider';
import { baseFingerprint, decodeCareer, encodeCareer, isEncoded, CodecError, type EncodedCareer } from './career-codec';
import { advanceToMatch, completeRound, createCareer, ensureFields, nextFixture, type CareerV2 } from './career';
import { initializeSeason } from './seasons';
import { createPackStore, gameClubRefs, createWorldPlayerProvider, importDatapackForGame, worldPlayersFromStore } from './datapack-bridge';
import { testPack } from '@/lib/datapack/fixtures';
import type { Datapack } from '@/lib/datapack/types';
import type { PackFile } from '@/lib/datapack/bundle';

const files = (p: unknown): PackFile[] => [{ name: 'datapack.json', text: JSON.stringify(p) }];
const json = (o: unknown) => JSON.parse(JSON.stringify(o));
const ASOF = '2026-11-09';

/** Pacote SINTÉTICO que cobre dois clubes REAIS DO JOGO (por legacyId) com jogadores inventados dos testes.
 *  Serve só para exercitar a ponte; nada aqui é dado real de jogador. */
function packForGame(version = '1.0.0', squad = 15): Datapack {
  const p = JSON.parse(JSON.stringify(testPack({ clubs: 2, playersPerClub: squad })).replace(/teste/g, 'ponte').replace(/Teste/g, 'Ponte')) as Datapack;
  p.manifest.origin = 'comunitario';
  p.manifest.source = { name: 'Gerador sintético dos testes unitários', license: 'Uso interno de testes' };
  p.manifest.version = version;
  p.clubs[0]!.legacyId = 'flamengo';
  p.clubs[1]!.legacyId = 'palmeiras';
  p.clubs[0]!.city = 'Cidade Inventada'; p.clubs[0]!.stadium = 'Estádio Inventado'; p.clubs[0]!.colors = ['#000000', '#ffffff'];
  return p;
}
const snapshotAdmin = () => JSON.stringify({ CLUBS, SOURCES, SPONSOR_MAP_2025, SECTOR_WEIGHTS_2025, SPONSOR_COMPANIES, STAFF_SALARY_IBGE_2024 });
const career = () => initializeSeason(ensureFields(createCareer('Teste', 'flamengo')));

describe('Ponte do datapack · integridade dos clubes e das finanças', () => {
  it('importar não altera clubes, estádios, cidades, patrocinadores nem dados financeiros', () => {
    const before = snapshotAdmin();
    const store = createPackStore();
    const r = importDatapackForGame(store, files(packForGame()));
    expect(r.report.errors).toBe(0);
    expect(r.reconciliation).toMatchObject({ matched: ['flamengo', 'palmeiras'], unknownLegacy: [] });
    expect(r.report.issues.some((i) => i.code === 'admin_fields_ignored')).toBe(true);
    createWorldPlayerProvider(store, { asOf: ASOF }); // construir o provedor também não pode mexer em nada
    expect(snapshotAdmin()).toBe(before);
    const fla = legacyClubs.get('flamengo');
    expect(fla.city).not.toBe('Cidade Inventada');
    expect(fla.stadium).not.toBe('Estádio Inventado');
  });
  it('as informações do pacote sobre o clube não chegam ao jogo: sem campos administrativos em BasePlayer', () => {
    const store = createPackStore();
    importDatapackForGame(store, files(packForGame()));
    const { active } = worldPlayersFromStore(store, { asOf: ASOF });
    expect(active.length).toBe(30);
    for (const p of active) expect(Object.keys(p).some((k) => ['city', 'stadium', 'colors', 'budget', 'debt'].includes(k))).toBe(false);
    expect(new Set(active.map((p) => p.clubId))).toEqual(new Set(['flamengo', 'palmeiras']));
  });
  it('clube com legacyId inexistente no jogo é apenas avisado no relatório', () => {
    const p = packForGame(); p.clubs[1]!.legacyId = 'clube-que-nao-existe';
    const r = importDatapackForGame(createPackStore(), files(p));
    expect(r.reconciliation!.unknownLegacy).toEqual(['clube-que-nao-existe']);
    expect(r.report.issues.some((i) => i.code === 'legacy_club_unknown')).toBe(true);
  });
  it('referências de clubes do jogo continuam completas', () => {
    expect(gameClubRefs().map((c) => c.id)).toEqual(CLUBS.map((c) => c.id));
  });
});

describe('Ponte do datapack · compatibilidade com o PlayerProvider', () => {
  it('pacotes de teste não entram no provedor do jogo real, a menos que autorizado', () => {
    const store = createPackStore();
    const t = importDatapackForGame(store, files(testPack({ playersPerClub: 15 })), { allowTestData: true });
    expect(t.status).toBe('new');
    expect(worldPlayersFromStore(store, { asOf: ASOF }).active).toHaveLength(0);
    expect(worldPlayersFromStore(store, { asOf: ASOF, allowTestData: true }).active).toHaveLength(30);
  });
  it('o provedor combinado manda nos clubes cobertos, mantém os demais e resolve ids antigos', () => {
    const store = createPackStore();
    importDatapackForGame(store, files(packForGame()));
    const world = createWorldPlayerProvider(store, { asOf: ASOF });
    expect(world.byClub('flamengo')).toHaveLength(15);
    expect(world.byClub('flamengo')[0]!.origin).toBe('pacote-ponte');
    expect(world.byClub('bahia').length).toBe(legacyPlayers.byClub('bahia').length); // não coberto: continua o do jogo
    const oldId = legacyPlayers.byClub('flamengo')[0]!.id;
    expect(world.has(oldId)).toBe(true); // save antigo continua resolvendo
    expect(world.list().some((p) => p.id === legacyPlayers.byClub('flamengo')[0]!.id)).toBe(false);
    const g = toGamePlayer(world.byClub('flamengo')[0]!);
    expect(g.clubId).toBe('flamengo');
    expect(typeof g.rating).toBe('number');
  });
  it('jogadores aposentados por uma atualização continuam resolvendo por id, sem aparecer em listas', () => {
    const store = createPackStore();
    importDatapackForGame(store, files(packForGame('1.0.0', 15)));
    const goneId = store.get('pacote-ponte')!.pack.players[14]!.id; // último do flamengo
    const next = packForGame('1.1.0', 14); // 14 por clube: um jogador de cada clube some
    const r = importDatapackForGame(store, files(next));
    expect(r.status).toBe('update');
    expect(r.diff!.players.disappeared).toContain(goneId);
    const world = createWorldPlayerProvider(store, { asOf: ASOF });
    expect(world.has(goneId)).toBe(true);
    expect(world.list().some((p) => p.id === goneId)).toBe(false);
    expect(world.get(goneId).clubId).toBe('flamengo');
  });
  it('ids estáveis não dependem do clube: transferência em atualização mantém o mesmo jogador', () => {
    const store = createPackStore();
    importDatapackForGame(store, files(packForGame('1.0.0')));
    const v2 = packForGame('1.1.0'); const mover = v2.players[0]!; mover.clubId = v2.clubs[1]!.id;
    importDatapackForGame(store, files(v2));
    const world = createWorldPlayerProvider(store, { asOf: ASOF });
    expect(world.get(mover.id).clubId).toBe('palmeiras');
    expect(world.list().filter((p) => p.id === mover.id)).toHaveLength(1);
  });
});

describe('Ponte do datapack · identidade entre pacotes', () => {
  it('pacotes de dois clubes do jogo, com um jogador compartilhado, entram sem duplicar e com a precedência certa', () => {
    const a = packForGame('1.0.0'); a.manifest.packId = 'pacote-fla';
    const b = packForGame('1.0.0'); b.manifest.packId = 'pacote-pal';
    const palId = a.clubs[1]!.id; a.clubs = [a.clubs[0]!]; a.players = a.players.filter((p) => p.clubId !== palId); // a só cobre o Flamengo
    a.editions[0]!.clubIds = [a.clubs[0]!.id]; a.manifest.counts = { countries: 1, competitions: 1, clubs: 1, players: a.players.length, editions: 1 };
    // b só cobre o Palmeiras e leva o jogador 1 do Flamengo emprestado, com o mesmo id e a mesma identidade
    b.clubs = [b.clubs[1]!]; b.players = b.players.filter((p) => p.clubId === b.clubs[0]!.id);
    const shared = JSON.parse(JSON.stringify(a.players[0]!)); // jogador do Flamengo
    shared.clubId = b.clubs[0]!.id; b.players.push(shared);
    b.editions[0]!.clubIds = [b.clubs[0]!.id]; b.manifest.counts = { countries: 1, competitions: 1, clubs: 1, players: b.players.length, editions: 1 };
    const store = createPackStore();
    expect(importDatapackForGame(store, files(a), { allowTestData: true }).report.errors).toBe(0);
    const r = importDatapackForGame(store, files(b), { allowTestData: true });
    expect(r.report.errors).toBe(0);
    expect(r.shared?.players).toBe(1);
    const world = createWorldPlayerProvider(store, { asOf: ASOF, allowTestData: true });
    expect(world.list().filter((p) => p.id === shared.id)).toHaveLength(1);
    expect(world.get(shared.id).clubId).toBe('flamengo'); // empate de prioridade e data: vence o packId "pacote-fla"
    store.setPriority('pacote-pal', 3);
    expect(createWorldPlayerProvider(store, { asOf: ASOF, allowTestData: true }).get(shared.id).clubId).toBe('palmeiras');
  });
  it('ligação confirmada faz o id antigo resolver para o jogador canônico no provedor', () => {
    const v1 = packForGame('1.0.0'); const v2 = packForGame('1.1.0');
    const oldId = v1.players[0]!.id; v2.players[0]!.id = 'plr:ponte-renomeado-1';
    const store = createPackStore();
    importDatapackForGame(store, files(v1), { allowTestData: true }); importDatapackForGame(store, files(v2), { allowTestData: true });
    expect(store.link(oldId, 'plr:ponte-renomeado-1', 'o pacote trocou o id').ok).toBe(true);
    const world = createWorldPlayerProvider(store, { asOf: ASOF, allowTestData: true });
    expect(world.find(oldId)?.id).toBe('plr:ponte-renomeado-1');
    expect(world.resolveId(oldId)).toBe('plr:ponte-renomeado-1');
    expect(world.list().some((p) => p.id === oldId)).toBe(false);
  });
});

describe('Ponte do datapack · compatibilidade com o career-codec', () => {
  const rounds = (c: CareerV2, n: number) => { for (let i = 0; i < n; i++) { c = advanceToMatch(c); if (!nextFixture(c)) break; c = completeRound(c, 1, 0, undefined, '2026-11-08'); } return c; };
  it('reabre sem perda um save compactado com o provedor do mundo importado', () => {
    const store = createPackStore();
    importDatapackForGame(store, files(packForGame()));
    const world: PlayerProvider = createWorldPlayerProvider(store, { asOf: ASOF });
    const c = rounds(career(), 5);
    const e = encodeCareer(c, world) as EncodedCareer;
    expect(isEncoded(e)).toBe(true);
    expect(json(decodeCareer(json(e), world))).toEqual(json(c));
  });
  it('save compactado com o provedor atual NÃO abre com outro provedor: recusa segura, nunca dado errado', () => {
    const store = createPackStore();
    importDatapackForGame(store, files(packForGame()));
    const world = createWorldPlayerProvider(store, { asOf: ASOF });
    expect(baseFingerprint(world)).not.toBe(baseFingerprint(legacyPlayers));
    const e = json(encodeCareer(rounds(career(), 3))); // com os jogadores atuais
    let code = '';
    try { decodeCareer(e, world); } catch (err) { code = err instanceof CodecError ? err.code : 'outro'; }
    expect(code).toBe('base_changed');
  });
  it('carreira em formato clássico continua abrindo igual, sem passar por nenhum pacote', () => {
    const c = rounds(career(), 4);
    expect(json(decodeCareer(json(c)))).toEqual(json(c));
  });
  it('um pacote instalado depois não muda o provedor atual (os saves existentes seguem usando os jogadores do jogo)', () => {
    const before = baseFingerprint(legacyPlayers);
    importDatapackForGame(createPackStore(), files(packForGame()));
    expect(baseFingerprint(legacyPlayers)).toBe(before);
  });
});

describe('Ponte do datapack · o jogo ainda não usa a importação', () => {
  it('nenhuma tela, save ou regra importa o importador, a loja, a ponte ou as fixtures (só os próprios módulos e testes)', () => {
    const root = resolve(__dirname, '../..');
    const files: string[] = [];
    const walk = (dir: string) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = resolve(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name)) files.push(p); } };
    walk(root);
    const uses = /datapack-bridge|datapack\/(import|store|slice|bundle|adapters|diff|identity|report|fixtures)|from ["']@\/lib\/datapack["']/;
    const offenders = files.filter((f) => !/\.test\.tsx?$/.test(f) && !/lib\/datapack\//.test(f) && !/lib\/game\/datapack-bridge\.ts$/.test(f) && !/components\/game\/datapack-admin-view\.tsx$/.test(f) && uses.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.replace(root, 'src'))).toEqual([]);
    // a tela administrativa isolada também não está ligada a nada
    const wired = files.filter((f) => !/\.test\.tsx?$/.test(f) && !/datapack-admin-view\.tsx$/.test(f) && /datapack-admin-view/.test(readFileSync(f, 'utf8')));
    expect(wired.map((f) => f.replace(root, 'src'))).toEqual([]);
  });
});
