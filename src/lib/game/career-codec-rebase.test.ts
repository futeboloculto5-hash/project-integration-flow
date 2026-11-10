import { describe, expect, it } from 'vitest';
import { advanceToMatch, buyPlayer, completeRound, createCareer, ensureFields, nextFixture, type CareerV2, type Player } from './career';
import { initializeSeason } from './seasons';
import { CodecError, baseFingerprint, decodeCareer, decodeCareerWithReport, encodeCareer, isEncoded, type EncodedCareer } from './career-codec';
import { createPackStore, createWorldPlayerProvider, importDatapackForGame } from './datapack-bridge';
import { legacyPlayers, toGamePlayer, createPlayerProvider } from './player-provider';
import type { Datapack } from '@/lib/datapack/types';
import type { PackFile } from '@/lib/datapack/bundle';

const files = (p: unknown): PackFile[] => [{ name: 'datapack.json', text: JSON.stringify(p) }];
const json = (o: unknown) => JSON.parse(JSON.stringify(o));
const ASOF = '2026-11-09';

/** Pacote SINTÉTICO que cobre dois clubes do jogo (bahia e sport) com atletas inventados pelos testes. */
function pk(version: string, edit: (p: Datapack) => void = () => {}): Datapack {
  const mkClub = (slug: string, name: string) => ({ id: `club:rb-${slug}` as const, name, countryId: 'ctry:rb' as const, legacyId: slug });
  const clubs = [mkClub('bahia', 'Bahia'), mkClub('sport', 'Sport')];
  const players: Datapack['players'] = clubs.flatMap((c) => Array.from({ length: 14 }, (_, j) => ({
    id: `plr:rb-${c.legacyId}-${j + 1}` as const, name: `Atleta ${c.legacyId} ${j + 1}`, position: (['GK', 'CB', 'CM', 'ST'] as const)[j % 4]!,
    clubId: c.id, overall: 50 + j, age: 20 + (j % 10), birthDate: undefined as unknown as string,
  }))).map(({ birthDate: _b, ...rest }) => rest);
  const p: Datapack = {
    manifest: { schema: 'ccw.datapack', schemaVersion: 1, packId: 'pacote-rb', version, name: 'Pacote de rebase (sintético)', createdAt: '2026-11-01', origin: 'comunitario',
      source: { name: 'Gerador sintético dos testes', license: 'Uso interno de testes' }, counts: { countries: 1, competitions: 1, clubs: 2, players: players.length, editions: 1 } },
    countries: [{ id: 'ctry:rb', name: 'País Sintético' }],
    competitions: [{ id: 'comp:rb-liga', name: 'Liga Sintética', countryId: 'ctry:rb', kind: 'league', tier: 1 }],
    editions: [{ competitionId: 'comp:rb-liga', season: '2026', clubIds: clubs.map((c) => c.id) }],
    clubs, players,
  };
  edit(p);
  p.manifest.counts = { countries: p.countries.length, competitions: p.competitions.length, clubs: p.clubs.length, players: p.players.length, editions: p.editions.length };
  return p;
}
const pl = (p: Datapack, id: string) => p.players.find((x) => x.id === id)!;
const A = 'plr:rb-bahia-1', B = 'plr:rb-bahia-2', C = 'plr:rb-bahia-3', E = 'plr:rb-bahia-4', C2 = 'plr:rb-bahia-5', D = 'plr:rb-sport-1', N = 'plr:rb-bahia-99';

function install(store: ReturnType<typeof createPackStore>, p: Datapack) {
  const r = importDatapackForGame(store, files(p), { allowTestData: true });
  expect(r.report.errors).toBe(0);
  return createWorldPlayerProvider(store, { asOf: ASOF, allowTestData: true });
}
const baseCareer = () => initializeSeason(ensureFields(createCareer('Teste', 'flamengo')));

/** Carreira que "rodou" com o mundo v1: elencos de bahia e sport guardados com jogadores do pacote, mais evoluções da carreira. */
function careerOnWorld(world1: ReturnType<typeof createWorldPlayerProvider>): CareerV2 {
  const c = baseCareer();
  const g = (id: string): Player => structuredClone(toGamePlayer(world1.get(id)));
  const bahia = Array.from({ length: 14 }, (_, j) => g(`plr:rb-bahia-${j + 1}`));
  const sport = Array.from({ length: 14 }, (_, j) => g(`plr:rb-sport-${j + 1}`));
  const a = bahia[0]!; a.rating += 3; a.age += 1; // evolução da carreira
  const b = bahia[1]!; b.clubId = 'sport'; // transferido para o Sport durante a carreira
  const d = sport[0]!; // comprado pelo técnico
  c.otherSquads = { bahia: bahia.filter((p) => p.id !== B), sport: [...sport.slice(1), b] };
  d.clubId = 'flamengo'; d.wage += 1000; c.squad = [...c.squad, d]; c.transferredIn = [...c.transferredIn, d.id];
  return c;
}

describe('Fase 2 · atualização de datapack não destrói a carreira (rebase)', () => {
  function scenario() {
    const store = createPackStore();
    const world1 = install(store, pk('1.0.0'));
    const career = careerOnWorld(world1);
    const saved = json(encodeCareer(career, world1, { baseRef: { source: world1.source, packs: [{ packId: 'pacote-rb', version: '1.0.0' }] } })) as EncodedCareer;
    expect(isEncoded(saved)).toBe(true);
    const v2 = pk('1.1.0', (p) => {
      pl(p, A).overall = 70; // a base subiu; a carreira também evoluiu o jogador: a carreira manda
      pl(p, C).overall = 58; // a carreira não mexeu: adota a base nova
      p.players = p.players.filter((x) => x.id !== E); // saiu do pacote
      pl(p, C2).clubId = 'club:rb-sport'; // no pacote novo ele foi para o Sport; na carreira continua no Bahia
      p.players.push({ id: N as Datapack['players'][number]['id'], name: 'Atleta Novo', position: 'ST', clubId: 'club:rb-bahia', overall: 66, age: 19 });
    });
    const r = importDatapackForGame(store, files(v2), { allowTestData: true });
    expect(r.status).toBe('update');
    const world2 = createWorldPlayerProvider(store, { asOf: ASOF, allowTestData: true });
    return { store, world1, world2, career, saved, v2 };
  }

  it('o padrão continua recusando com base_changed, sem alterar o save', () => {
    const { world2, saved } = scenario();
    const before = JSON.stringify(saved);
    let code = '';
    try { decodeCareer(saved, world2); } catch (e) { code = e instanceof CodecError ? e.code : 'outro'; }
    expect(code).toBe('base_changed');
    expect(JSON.stringify(saved)).toBe(before);
  });
  it('com rebase: a evolução da carreira fica, o que ela não tocou adota a base nova', () => {
    const { world2, career, saved } = scenario();
    const { career: back, report } = decodeCareerWithReport(saved, world2, { rebase: true });
    const bahia = back.otherSquads!['bahia']!, sport = back.otherSquads!['sport']!;
    const a = bahia.find((p) => p.id === A)!;
    expect(a.rating).toBe(53); // 50 (base v1) + 3 da carreira; a base nova diz 70, mas a carreira manda
    expect(a.age).toBe(21);
    expect(bahia.find((p) => p.id === C)!.rating).toBe(58); // adotou a base nova
    expect(bahia.find((p) => p.id === C2)!.clubId).toBe('bahia'); // a carreira manda no clube
    expect(sport.some((p) => p.id === B && p.clubId === 'sport')).toBe(true); // o transferido continua reconhecido
    expect(report.rebased).toBe(true);
    expect(report.careerOwnedFields['rating']).toBeGreaterThanOrEqual(1);
    expect(report.careerOwnedFields['clubId']).toBeGreaterThanOrEqual(1);
    // o que não é elenco da IA ficou idêntico
    expect(json(back.squad)).toEqual(json(career.squad));
    expect(json(back.transferredIn)).toEqual(json(career.transferredIn));
    expect(back.clubId).toBe(career.clubId);
    expect(back.balance).toBe(career.balance);
  });
  it('jogador que saiu do pacote continua no elenco da carreira (aposentado resolve por id)', () => {
    const { world2, career, saved } = scenario();
    const { career: back, report } = decodeCareerWithReport(saved, world2, { rebase: true });
    const e = back.otherSquads!['bahia']!.find((p) => p.id === E);
    expect(e).toBeDefined();
    expect(json(e)).toEqual(json(career.otherSquads!['bahia']!.find((p) => p.id === E)));
    expect(report.onRetiredBase).toBe(1);
    expect(world2.list().some((p) => p.id === E)).toBe(false); // não é mais listado…
    expect(world2.has(E)).toBe(true); // …mas existe
  });
  it('nenhum jogador do save some e nenhum aparece duplicado', () => {
    const { world2, career, saved } = scenario();
    const back = decodeCareer(saved, world2, { rebase: true });
    const ids = (c: CareerV2) => Object.values(c.otherSquads ?? {}).flat().map((p) => p.id).sort();
    expect(ids(back)).toEqual(ids(career));
    expect(new Set(ids(back)).size).toBe(ids(back).length);
  });
  it('jogador novo do pacote não é inserido em elenco já salvo, mas é contado no relatório', () => {
    const { world2, saved } = scenario();
    const { career: back, report } = decodeCareerWithReport(saved, world2, { rebase: true });
    expect(Object.values(back.otherSquads!).flat().some((p) => p.id === N)).toBe(false);
    expect(report.unplacedBasePlayers).toBe(1);
  });
  it('depois do rebase, gravar de novo com a base nova é exato e idempotente', () => {
    const { world2, saved } = scenario();
    const back = decodeCareer(saved, world2, { rebase: true });
    const e2 = encodeCareer(back, world2) as EncodedCareer;
    expect(e2.playerStore.baseFingerprint).toBe(baseFingerprint(world2));
    expect(json(decodeCareer(json(e2), world2))).toEqual(json(back)); // abre sem rebase
    expect(json(encodeCareer(e2, world2))).toEqual(json(e2));
  });
  it('jogador comprado e depois vendido para fora não é contado como "sem lugar"; campo removido pela carreira é relatado', () => {
    const store = createPackStore();
    const world1 = install(store, pk('1.0.0'));
    const c = careerOnWorld(world1);
    c.squad = c.squad.filter((p) => p.id !== D); // vendido para um clube que o jogo não guarda; continua em transferredIn
    const withUnset = c.otherSquads!['bahia']![4]!; delete (withUnset as unknown as Record<string, unknown>)['wage']; // campo da base que a carreira removeu
    const saved = json(encodeCareer(c, world1)) as EncodedCareer;
    importDatapackForGame(store, files(pk('1.1.0', (p) => { pl(p, C).overall = 59; })), { allowTestData: true });
    const world2 = createWorldPlayerProvider(store, { asOf: ASOF, allowTestData: true });
    const { report } = decodeCareerWithReport(saved, world2, { rebase: true });
    expect(report.unplacedBasePlayers).toBe(0);
    expect(report.careerOwnedFields['-wage']).toBe(1);
  });
  it('baseRef é opcional, informativo e vai no relatório', () => {
    const { saved, world2 } = scenario();
    expect(saved.playerStore.baseRef).toEqual({ source: expect.any(String), packs: [{ packId: 'pacote-rb', version: '1.0.0' }] });
    expect(decodeCareerWithReport(saved, world2, { rebase: true }).report.savedWith?.packs[0]!.version).toBe('1.0.0');
    const noRef = json(encodeCareer(baseCareerWithSquads(), legacyPlayers)) as EncodedCareer;
    expect('baseRef' in noRef.playerStore).toBe(false); // sem pedir, o formato é o mesmo de antes
  });
  it('mesma base: rebase não muda nada e relata rebased=false', () => {
    const { world1, saved } = scenario();
    const r = decodeCareerWithReport(saved, world1, { rebase: true });
    expect(r.report.rebased).toBe(false);
    expect(json(r.career)).toEqual(json(decodeCareer(saved, world1)));
  });
  it('se a base antiga do jogador não existe mais (nem aposentada), recusa com base_missing e preserva o save', () => {
    const { world2, saved } = scenario();
    const bare = createPlayerProvider('sem-aposentados', world2.list().filter((p) => p.id !== E)); // provedor que perdeu os aposentados
    const before = JSON.stringify(saved);
    let code = '';
    try { decodeCareer(saved, bare, { rebase: true }); } catch (e) { code = e instanceof CodecError ? e.code : 'outro'; }
    expect(code).toBe('base_missing');
    expect(JSON.stringify(saved)).toBe(before);
  });
  it('rebase não mascara save inválido nem formato desconhecido', () => {
    const { world2, saved } = scenario();
    const broken = json(saved); delete broken.playerStore;
    expect(() => decodeCareer(broken, world2, { rebase: true })).toThrow(CodecError);
    expect(() => decodeCareer({ ...baseCareer(), saveFormat: 9 } as never, world2, { rebase: true })).toThrow(/desconhecido/);
  });
  it('ligação de identidade confirmada: o id salvo é mantido, mesmo apontando para a base canônica', () => {
    const store = createPackStore();
    const world1 = install(store, pk('1.0.0'));
    const saved = json(encodeCareer(careerOnWorld(world1), world1)) as EncodedCareer;
    const v2 = pk('1.1.0', (p) => { pl(p, A).id = 'plr:rb-bahia-1-novo'; });
    importDatapackForGame(store, files(v2), { allowTestData: true });
    expect(store.link(A, 'plr:rb-bahia-1-novo', 'o pacote trocou o id deste jogador').ok).toBe(true);
    const world2 = createWorldPlayerProvider(store, { asOf: ASOF, allowTestData: true });
    const back = decodeCareer(saved, world2, { rebase: true });
    const a = back.otherSquads!['bahia']!.find((p) => p.name.endsWith('bahia 1'))!;
    expect(a.id).toBe(A); // o id que mercado, histórico e ofertas usam não muda
    expect(a.rating).toBe(53);
  });
});

function baseCareerWithSquads(): CareerV2 {
  let c = baseCareer();
  for (let i = 0; i < 6; i++) { c = advanceToMatch(c); if (!nextFixture(c)) break; c = completeRound(c, 1, 0, undefined, '2026-11-08'); }
  c = buyPlayer(c, c.market.find((p) => p.clubId !== 'livre')!.id).career;
  return c;
}

describe('Fase 2 · saves antigos continuam funcionando', () => {
  it('save clássico abre igual, com ou sem pacote instalado e com ou sem rebase', () => {
    const c = baseCareerWithSquads();
    const store = createPackStore();
    const world = install(store, pk('1.0.0'));
    expect(decodeCareer(json(c))).toEqual(json(c));
    expect(decodeCareer(json(c), world)).toEqual(json(c));
    expect(decodeCareer(json(c), world, { rebase: true })).toEqual(json(c));
  });
  it('save compactado com os jogadores atuais do jogo abre com o provedor atual, como sempre', () => {
    const c = baseCareerWithSquads();
    const e = json(encodeCareer(c, legacyPlayers));
    expect(json(decodeCareer(e, legacyPlayers))).toEqual(json(c));
  });
  it('depois de instalar um pacote que cobre bahia e sport, o save antigo reabre com rebase sem perder nada', () => {
    const c = baseCareerWithSquads();
    c.otherSquads = { ...c.otherSquads, bahia: legacyPlayers.byClub('bahia').map((p) => structuredClone(toGamePlayer(p))), sport: legacyPlayers.byClub('sport').map((p) => structuredClone(toGamePlayer(p))) };
    c.otherSquads['bahia']![0]!.rating += 2;
    const saved = json(encodeCareer(c, legacyPlayers));
    const store = createPackStore();
    const world = install(store, pk('1.0.0'));
    expect(() => decodeCareer(saved, world)).toThrow(CodecError); // padrão: recusa
    const back = decodeCareer(saved, world, { rebase: true });
    expect(json(back)).toEqual(json(c)); // os elencos antigos (ids legados) ficaram exatamente como estavam
  });
  it('save antigo reabre com o provedor atual depois de um pacote ser instalado (o pacote não muda o provedor atual)', () => {
    const c = baseCareerWithSquads();
    const saved = json(encodeCareer(c, legacyPlayers));
    const store = createPackStore();
    install(store, pk('1.0.0'));
    expect(json(decodeCareer(saved, legacyPlayers))).toEqual(json(c));
  });
});
