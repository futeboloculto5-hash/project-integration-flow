import { describe, expect, it } from 'vitest';
import { adminSnapshot, checkForUpdates, summarizeImport, summarizePack } from './admin-model';
import { createPackStore } from './store';
import { importDatapack } from './import';
import { syntheticSquadPack, testPack } from './fixtures';
import type { Datapack } from './types';

const files = (p: unknown) => [{ name: 'datapack.json', text: JSON.stringify(p) }];
const pack = (o: Parameters<typeof syntheticSquadPack>[0] = { clubs: ['alfa', 'beta'] }) => syntheticSquadPack(o);

describe('Administração · resumo dos pacotes instalados', () => {
  it('mostra versão, país, temporada, quantidades, competições, origem e licença', () => {
    const store = createPackStore();
    store.importFiles(files(pack({ clubs: ['alfa', 'beta'], free: 3 })));
    const s = summarizePack(store.get('pacote-sintetico')!);
    expect(s).toMatchObject({ packId: 'pacote-sintetico', version: '1.0.0', origin: 'comunitario', isTest: false, seasons: ['2026'], confederations: ['CONMEBOL'] });
    expect(s.countries).toEqual([{ id: 'ctry:sint-brasil', name: 'País Sintético', confederation: 'CONMEBOL' }]);
    expect(s.counts).toEqual({ clubs: 2, players: 55, competitions: 1, editions: 1, retired: 0, freeAgents: 3 });
    expect(s.competitions).toEqual([{ id: 'comp:sint-liga', name: 'Liga Sintética', country: 'País Sintético', kind: 'league', tier: 1, seasons: ['2026'], clubs: 2 }]);
    expect(s.source.license).toBe('Uso interno de testes');
    expect(s.source.name).toContain('não são dados reais');
  });
  it('pacote de teste é identificado como tal', () => {
    const store = createPackStore();
    store.importFiles(files(testPack({ playersPerClub: 15 })), { allowTestData: true });
    const snap = adminSnapshot(store);
    expect(snap.hasTestPacks).toBe(true);
    expect(snap.packs[0]!.originLabel).toContain('TESTE');
    expect(snap.packs[0]!.source.license).toBeNull();
  });
  it('totais do mundo: pacotes, clubes e jogadores efetivos, compartilhados e aposentados', () => {
    const store = createPackStore();
    store.importFiles(files(pack({ clubs: ['alfa', 'beta'] })));
    const other = pack({ clubs: ['beta', 'gama'], packId: 'pacote-sintetico-2' });
    store.importFiles(files(other));
    const t = adminSnapshot(store).totals;
    expect(t.packs).toBe(2);
    expect(t.clubs).toBe(3); // beta é compartilhado
    expect(t.sharedClubs).toBe(1);
    expect(t.sharedPlayers).toBeGreaterThan(0);
    const v2 = pack({ clubs: ['alfa', 'beta'], version: '1.1.0' });
    v2.players = v2.players.slice(1); v2.manifest.counts.players--;
    store.importFiles(files(v2));
    expect(adminSnapshot(store).totals.retired).toBeGreaterThanOrEqual(1);
    expect(adminSnapshot(store).packs.find((p) => p.packId === 'pacote-sintetico')!.history).toEqual(['1.0.0', '1.1.0']);
  });
  it('loja vazia: tudo zero, sem erro', () => {
    const s = adminSnapshot(createPackStore());
    expect(s.packs).toEqual([]);
    expect(s.totals.players).toBe(0);
    expect(s.hasTestPacks).toBe(false);
  });
});

describe('Administração · verificar atualizações', () => {
  it('compara o catálogo informado com o que está instalado; ignora pacotes não instalados', () => {
    const store = createPackStore();
    store.importFiles(files(pack()));
    const r = checkForUpdates(store, [
      { packId: 'pacote-sintetico', version: '1.2.0', url: 'https://exemplo.invalid/p' },
      { packId: 'outro-pacote', version: '9.0.0' },
    ]);
    expect(r).toEqual([{ packId: 'pacote-sintetico', name: 'Pacote sintético de integração', installed: '1.0.0', available: '1.2.0', state: 'update', url: 'https://exemplo.invalid/p' }]);
    expect(checkForUpdates(store, [{ packId: 'pacote-sintetico', version: '1.0.0' }])[0]!.state).toBe('current');
    expect(checkForUpdates(store, [{ packId: 'pacote-sintetico', version: '0.9.0' }])[0]!.state).toBe('older');
  });
});

describe('Administração · relatório da importação', () => {
  it('pacote rejeitado: erros listados, sem comparação', () => {
    const p = pack(); delete p.manifest.source;
    const r = importDatapack(files(p));
    const s = summarizeImport(r);
    expect(s.status).toBe('rejected');
    expect(s.statusLabel).toBe('Rejeitado');
    expect(s.ok).toBe(false);
    expect(s.errors.map((e) => e.code)).toEqual(expect.arrayContaining(['missing_source', 'missing_license']));
    expect(s.changes).toBeNull();
  });
  it('atualização: jogadores adicionados, alterados, transferidos e removidos, com nomes e limite', () => {
    const store = createPackStore();
    const v1 = pack({ clubs: ['alfa', 'beta'] });
    store.importFiles(files(v1));
    const v2: Datapack = JSON.parse(JSON.stringify(v1)); v2.manifest.version = '1.1.0';
    v2.players[0]!.overall += 3; // alterado
    const mover = v2.players[1]!; mover.clubId = 'club:sint-beta'; // transferido
    const gone = v2.players.splice(2, 1)[0]!; // removido
    v2.players.push({ id: 'plr:sint-novo', name: 'Atleta Sintético Novo', position: 'ST', clubId: 'club:sint-alfa', overall: 60, age: 20 });
    v2.manifest.counts.players = v2.players.length;
    const r = store.importFiles(files(v2));
    const s = summarizeImport(r, v1);
    expect(s.status).toBe('update');
    expect(s.pack).toMatchObject({ version: '1.1.0', originLabel: 'Comunitário' });
    expect(s.changes!.fromVersion).toBe('1.0.0');
    expect(s.changes!.added).toEqual([{ id: 'plr:sint-novo', name: 'Atleta Sintético Novo', what: 'novo no pacote' }]);
    expect(s.changes!.changed).toEqual([{ id: v1.players[0]!.id, name: v1.players[0]!.name, what: 'força' }]);
    expect(s.changes!.moved[0]).toMatchObject({ id: mover.id, what: 'Clube Sintético alfa → Clube Sintético beta' });
    expect(s.changes!.disappeared[0]).toMatchObject({ id: gone.id, name: gone.name });
    expect(s.changes!.totals).toMatchObject({ added: 1, moved: 1, disappeared: 1 });
    expect(summarizeImport(r, v1, 0).changes!.added).toEqual([]); // limite
    expect(s.counts.errors).toBe(0);
  });
  it('reimportação idêntica aparece como "sem mudanças"', () => {
    const store = createPackStore();
    const p = pack();
    store.importFiles(files(p));
    const s = summarizeImport(store.importFiles(files(p)), p);
    expect(s.status).toBe('unchanged');
    expect(s.statusLabel).toContain('sem mudanças');
  });
});
