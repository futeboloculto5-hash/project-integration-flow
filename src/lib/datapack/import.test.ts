import { describe, expect, it } from 'vitest';
import { importDatapack, findTestMarkers } from './import';
import { createPackStore } from './store';
import { diffPacks, isEmptyDiff } from './diff';
import { buildIdentityIndex, findDuplicateCandidates, findInternalDuplicates, normalizeName } from './identity';
import { createAdapterRegistry, nativeAdapter, type DatapackAdapter } from './adapters';
import { hasCode, issuesOf, summarizeReport } from './report';
import { testPack } from './fixtures';
import type { Datapack, Player } from './types';
import type { PackFile } from './bundle';

const asFiles = (p: unknown): PackFile[] => [{ name: 'datapack.json', text: JSON.stringify(p) }];
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const codes = (r: { report: { issues: { code: string; severity: string }[] } }, sev?: string) => r.report.issues.filter((i) => !sev || i.severity === sev).map((i) => i.code);

/** Pacote SINTÉTICO que se declara "comunitario" com fonte e licença, para exercitar a política de pacotes reais.
 *  Só existe dentro dos testes; não representa nenhum dado real. */
function realLike(opts: { clubs?: number; playersPerClub?: number; version?: string } = {}): Datapack {
  const p = JSON.parse(JSON.stringify(testPack({ playersPerClub: 15, ...opts })).replace(/teste/g, 'alfa').replace(/Teste/g, 'Alfa')) as Datapack;
  p.manifest.origin = 'comunitario';
  p.manifest.source = { name: 'Gerador sintético dos testes unitários', license: 'Uso interno de testes' };
  p.manifest.version = opts.version ?? '1.0.0';
  return p;
}
const testOnly = (o = {}) => ({ allowTestData: true, ...o });

describe('Importação · pacote válido', () => {
  it('aceita um pacote de teste quando autorizado e identifica versão, temporada, países e regiões', () => {
    const r = importDatapack(asFiles(testPack({ playersPerClub: 15 })), testOnly());
    expect(r.status).toBe('new');
    expect(r.report.ok).toBe(true);
    expect(r.report.formatId).toBe('ccw-native-v1');
    expect(r.report.pack).toMatchObject({ packId: 'pacote-teste', version: '1.0.0', origin: 'teste', seasons: ['2026'], countries: 1 });
    expect(r.report.stats).toMatchObject({ clubs: 2, players: 30, editions: 1 });
    expect(codes(r, 'warning')).toContain('pack_is_test_data');
    expect(r.pack?.players).toHaveLength(30);
  });
  it('aceita pacote real com fonte e licença, sem nenhum erro', () => {
    const r = importDatapack(asFiles(realLike()));
    expect(r.report.errors).toBe(0);
    expect(r.status).toBe('new');
    expect(r.report.pack?.origin).toBe('comunitario');
  });
  it('lê o mesmo pacote entregue dividido em arquivos', () => {
    const p = realLike({ clubs: 3 });
    const files: PackFile[] = [
      { name: 'manifest.json', text: JSON.stringify(p.manifest) }, { name: 'countries.json', text: JSON.stringify(p.countries) },
      { name: 'competitions.json', text: JSON.stringify(p.competitions) }, { name: 'editions.json', text: JSON.stringify(p.editions) },
      { name: 'clubs.json', text: JSON.stringify(p.clubs) }, { name: 'players-a.ndjson', text: p.players.map((x) => JSON.stringify(x)).join('\n') },
    ];
    const r = importDatapack(files);
    expect(r.report.errors).toBe(0);
    expect(r.pack).toEqual(p);
  });
});

describe('Importação · pacote inválido é rejeitado inteiro', () => {
  it('formato desconhecido', () => {
    const r = importDatapack([{ name: 'dados.xml', text: '<a/>' }]);
    expect(r.status).toBe('rejected');
    expect(r.pack).toBeUndefined();
    expect(codes(r, 'error')).toEqual(['unknown_format']);
  });
  it('JSON quebrado', () => {
    const r = importDatapack([{ name: 'datapack.json', text: '{"manifest": {"schema":"ccw.datapack"' }]);
    // não é reconhecido como nativo (JSON ilegível) → rejeitado sem lançar exceção
    expect(r.status).toBe('rejected');
    expect(r.report.ok).toBe(false);
  });
  it('JSON quebrado em arquivo de pacote dividido aponta o arquivo', () => {
    const p = realLike();
    const r = importDatapack([
      { name: 'manifest.json', text: JSON.stringify(p.manifest) }, { name: 'clubs.json', text: '[{' },
    ]);
    expect(r.status).toBe('rejected');
    expect(r.report.issues.find((i) => i.code === 'bad_json')?.path).toBe('clubs.json');
  });
  it('ids duplicados', () => {
    const p = realLike();
    p.players.push(clone(p.players[0]!));
    p.manifest.counts.players++;
    const r = importDatapack(asFiles(p));
    expect(r.status).toBe('rejected');
    expect(codes(r, 'error')).toContain('duplicate_id');
  });
  it('referências inexistentes (clube, país, edição)', () => {
    const p = realLike();
    p.players[0]!.clubId = 'club:nao-existe';
    p.clubs[0]!.countryId = 'ctry:nao-existe';
    p.editions[0]!.clubIds.push('club:fantasma');
    const r = importDatapack(asFiles(p));
    expect(r.status).toBe('rejected');
    expect(codes(r, 'error').filter((c) => c === 'missing_ref').length).toBeGreaterThanOrEqual(3);
  });
  it('contagens do manifesto que não batem', () => {
    const p = realLike();
    p.manifest.counts.players += 5;
    expect(codes(importDatapack(asFiles(p)), 'error')).toContain('count_mismatch');
  });
  it('um adaptador não consegue pular a validação do contrato', () => {
    const evil: DatapackAdapter = { id: 'sem-validacao', label: 'teste', detect: () => ({ match: true }), convert: () => ({ pack: { manifest: { schema: 'ccw.datapack' } }, issues: [] }) };
    const r = importDatapack([{ name: 'x', text: '' }], { registry: createAdapterRegistry([evil]) });
    expect(r.status).toBe('rejected');
    expect(r.pack).toBeUndefined();
    expect(r.report.errors).toBeGreaterThan(0);
  });
  it('adaptador que entrega o contrato correto funciona sem mexer no pipeline (modularidade)', () => {
    const p = realLike();
    const csvLike: DatapackAdapter = { id: 'csv-de-teste', label: 'somente testes', detect: (f) => ({ match: f.some((x) => x.name.endsWith('.csv')) }), convert: () => ({ pack: p, issues: [] }) };
    const reg = createAdapterRegistry([nativeAdapter, csvLike]);
    const r = importDatapack([{ name: 'a.csv', text: 'x' }], { registry: reg });
    expect(r.report.formatId).toBe('csv-de-teste');
    expect(r.report.ok).toBe(true);
  });
  it('pacotes enormes ou hostis não derrubam: campos de tipo errado só geram erros', () => {
    const r = importDatapack(asFiles({ manifest: 7, countries: 'x', clubs: null, players: [1, 2, 3] }));
    expect(r.status).toBe('rejected');
  });
});

describe('Importação · origem, licença e dados de teste', () => {
  it('pacote de teste é recusado quando não autorizado', () => {
    const r = importDatapack(asFiles(testPack()));
    expect(r.status).toBe('rejected');
    expect(codes(r, 'error')).toContain('test_pack_rejected');
  });
  it('pacote "oficial" com dados de teste é rejeitado (fixture não passa por pacote real)', () => {
    const p = testPack({ playersPerClub: 15 });
    p.manifest.origin = 'oficial';
    p.manifest.source = { name: 'Alguma fonte', license: 'Licença X' };
    const r = importDatapack(asFiles(p));
    expect(r.status).toBe('rejected');
    expect(codes(r, 'error')).toContain('test_data_in_real_pack');
    expect(findTestMarkers(p).length).toBeGreaterThan(0);
    expect(findTestMarkers(realLike())).toEqual([]);
  });
  it('só uma entidade com marca de teste já basta', () => {
    const p = realLike();
    p.players[3]!.name = 'Jogador Teste 999';
    expect(codes(importDatapack(asFiles(p)), 'error')).toContain('test_data_in_real_pack');
    const q = realLike();
    q.clubs[0]!.id = 'club:teste-zzz';
    q.players.forEach((x) => { if (x.clubId === 'club:alfa-001') x.clubId = 'club:teste-zzz'; });
    q.editions[0]!.clubIds[0] = 'club:teste-zzz';
    expect(codes(importDatapack(asFiles(q)), 'error')).toContain('test_data_in_real_pack');
  });
  it('pacote real sem fonte ou sem licença é rejeitado', () => {
    const a = realLike(); delete a.manifest.source;
    expect(codes(importDatapack(asFiles(a)), 'error')).toEqual(expect.arrayContaining(['missing_source', 'missing_license']));
    const b = realLike(); b.manifest.source = { name: 'Só o nome' };
    const rb = importDatapack(asFiles(b));
    expect(codes(rb, 'error')).toEqual(['missing_license']);
  });
});

describe('Importação · jogadores em clubes incorretos e estrutura', () => {
  it('jogador apontando para clube que não existe no pacote', () => {
    const p = realLike();
    p.players[0]!.clubId = 'club:outro-pacote';
    const r = importDatapack(asFiles(p));
    expect(r.status).toBe('rejected');
    expect(r.report.issues.find((i) => i.code === 'missing_ref')?.path).toBe('players[0].clubId');
  });
  it('a mesma pessoa listada em dois clubes com ids diferentes vira candidato, sem unir', () => {
    const p = realLike();
    const a = p.players[0]!, b = p.players[20]!; // clubes diferentes
    a.name = 'Fulano de Tal'; a.birthDate = '2000-05-05'; delete a.age;
    b.name = 'Fulano de Tal'; b.birthDate = '2000-05-05'; delete b.age;
    const r = importDatapack(asFiles(p));
    expect(r.report.ok).toBe(true);
    expect(codes(r, 'warning')).toContain('possible_duplicate_player');
    expect(r.duplicates.some((d) => d.kind === 'name_and_birth' && [d.a, d.b].includes(a.id) && [d.a, d.b].includes(b.id))).toBe(true);
    expect(r.pack?.players.map((x) => x.id)).toEqual(expect.arrayContaining([a.id, b.id])); // os dois seguem existindo
  });
  it('clube fora de qualquer competição e elencos muito pequenos geram avisos', () => {
    const p = realLike({ playersPerClub: 3 });
    p.editions[0]!.clubIds = [p.clubs[0]!.id];
    const r = importDatapack(asFiles(p));
    expect(r.report.ok).toBe(true);
    expect(codes(r, 'warning')).toEqual(expect.arrayContaining(['club_without_edition', 'squad_size_out_of_range']));
  });
  it('limita a lista de avisos repetidos e resume o total', () => {
    const p = realLike({ clubs: 40, playersPerClub: 3 });
    const r = importDatapack(asFiles(p));
    const sq = r.report.issues.filter((i) => i.code === 'squad_size_out_of_range');
    expect(sq.length).toBe(11);
    expect(sq[10]!.message).toContain('40 clubes');
  });
});

describe('Importação · reconciliação com os clubes do jogo', () => {
  const game = [{ id: 'alfa', name: 'Alfa FC' }, { id: 'beta', name: 'Beta FC' }, { id: 'gama', name: 'Gama FC' }];
  it('casa por legacyId, ignora dados administrativos do pacote e avisa de legacyId desconhecido', () => {
    const p = realLike({ clubs: 3 });
    p.clubs[0]!.legacyId = 'alfa'; p.clubs[0]!.name = 'Alfa Futebol Clube'; p.clubs[0]!.city = 'Cidade do Pacote'; p.clubs[0]!.stadium = 'Estádio do Pacote';
    p.clubs[1]!.legacyId = 'beta';
    p.clubs[2]!.legacyId = 'nao-existe-no-jogo';
    const snapshot = JSON.stringify(game);
    const r = importDatapack(asFiles(p), { gameClubs: game });
    expect(r.report.ok).toBe(true);
    expect(r.reconciliation).toEqual({ matched: ['alfa', 'beta'], unknownLegacy: ['nao-existe-no-jogo'], packOnly: 1, gameClubsNotCovered: 1 });
    expect(codes(r)).toEqual(expect.arrayContaining(['legacy_club_unknown', 'admin_fields_ignored', 'club_name_differs']));
    expect(JSON.stringify(game)).toBe(snapshot); // os clubes do jogo não foram tocados
  });
  it('sem gameClubs a reconciliação é pulada', () => {
    expect(importDatapack(asFiles(realLike())).reconciliation).toBeUndefined();
  });
  it('legacyId repetido dentro do pacote é erro do validador', () => {
    const p = realLike({ clubs: 2 });
    p.clubs[0]!.legacyId = 'alfa'; p.clubs[1]!.legacyId = 'alfa';
    expect(codes(importDatapack(asFiles(p)), 'error')).toContain('duplicate_legacy_id');
  });
});

describe('Importação repetida e incremental (loja)', () => {
  it('importar duas vezes o mesmo pacote não duplica nada', () => {
    const store = createPackStore();
    const files = asFiles(realLike());
    const a = store.importFiles(files);
    const b = store.importFiles(files);
    expect(a.status).toBe('new');
    expect(b.status).toBe('unchanged');
    expect(hasCode(b.report, 'already_installed')).toBe(true);
    expect(store.list()).toHaveLength(1);
    expect(store.get('pacote-alfa')!.pack.players).toHaveLength(30);
    expect(store.get('pacote-alfa')!.history).toEqual(['1.0.0']);
  });
  it('mesma versão com conteúdo diferente é recusada e não altera o instalado', () => {
    const store = createPackStore();
    store.importFiles(asFiles(realLike()));
    const before = JSON.stringify(store.get('pacote-alfa'));
    const changed = realLike(); changed.players[0]!.overall = 99;
    const r = store.importFiles(asFiles(changed));
    expect(r.status).toBe('rejected');
    expect(codes(r, 'error')).toContain('same_version_different_content');
    expect(JSON.stringify(store.get('pacote-alfa'))).toBe(before);
  });
  it('versão mais antiga é recusada', () => {
    const store = createPackStore();
    store.importFiles(asFiles(realLike({ version: '1.2.0' })));
    const r = store.importFiles(asFiles(realLike({ version: '1.1.0' })));
    expect(codes(r, 'error')).toContain('downgrade');
    expect(store.get('pacote-alfa')!.pack.manifest.version).toBe('1.2.0');
  });
  it('rejeição de uma atualização inválida deixa a versão anterior intacta', () => {
    const store = createPackStore();
    store.importFiles(asFiles(realLike()));
    const before = JSON.stringify(store.get('pacote-alfa'));
    const bad = realLike({ version: '1.1.0' }); bad.players[0]!.clubId = 'club:fantasma';
    expect(store.importFiles(asFiles(bad)).status).toBe('rejected');
    expect(JSON.stringify(store.get('pacote-alfa'))).toBe(before);
  });

  function v2(): Datapack {
    const p = realLike({ version: '1.1.0' });
    p.manifest.previousVersion = '1.0.0';
    p.players[0]!.overall = 91; // atributo atualizado
    p.players[1]!.clubId = p.clubs[1]!.id; // transferido
    const gone = p.players.pop()!; // sumiu da versão nova
    p.manifest.counts.players--;
    void gone;
    p.players.push({ id: 'plr:alfa-novo-001', name: 'Jogador Alfa Novo', position: 'ST', clubId: p.clubs[0]!.id, overall: 60, age: 19, dataStatus: 'simulado' });
    p.manifest.counts.players++;
    return p;
  }
  it('atualização incremental: atualiza, adiciona, transfere e identifica quem sumiu, sem apagar ninguém', () => {
    const store = createPackStore();
    const v1 = realLike();
    store.importFiles(asFiles(v1));
    const goneId = v1.players[v1.players.length - 1]!.id;
    const r = store.importFiles(asFiles(v2()));
    expect(r.status).toBe('update');
    expect(r.report.ok).toBe(true);
    const d = r.diff!;
    expect(d.fromVersion).toBe('1.0.0');
    expect(d.toVersion).toBe('1.1.0');
    expect(d.players.added).toEqual(['plr:alfa-novo-001']);
    expect(d.players.disappeared).toEqual([goneId]);
    expect(d.players.changed.map((c) => c.id)).toEqual(expect.arrayContaining([v1.players[0]!.id, v1.players[1]!.id]));
    expect(d.players.changed.find((c) => c.id === v1.players[0]!.id)!.fields).toEqual(['overall']);
    expect(d.players.moved).toEqual([{ id: v1.players[1]!.id, from: v1.clubs[0]!.id, to: v1.clubs[1]!.id }]);
    expect(d.players.unchanged).toBe(30 - 3);
    // nada some: o jogador que saiu fica aposentado, com o último clube e a última versão
    const inst = store.get('pacote-alfa')!;
    expect(inst.history).toEqual(['1.0.0', '1.1.0']);
    expect(inst.retired).toHaveLength(1);
    expect(inst.retired[0]).toMatchObject({ lastSeenVersion: '1.0.0', lastClubGameId: 'alfa-002' });
    expect(inst.retired[0]!.player.id).toBe(goneId);
    expect(hasCode(r.report, 'players_disappeared')).toBe(true);
  });
  it('quem volta num pacote posterior deixa de ser aposentado', () => {
    const store = createPackStore();
    const v1 = realLike();
    store.importFiles(asFiles(v1));
    store.importFiles(asFiles(v2()));
    const goneId = v1.players[v1.players.length - 1]!.id;
    expect(store.get('pacote-alfa')!.retired.map((r) => r.player.id)).toEqual([goneId]);
    const back = realLike({ version: '1.2.0' }); // tem o jogador de volta, mas não tem o "novo" da 1.1.0
    store.importFiles(asFiles(back));
    expect(store.get('pacote-alfa')!.retired.map((r) => r.player.id)).toEqual(['plr:alfa-novo-001']);
  });
  it('clubes participantes de uma competição: quem entrou e quem saiu', () => {
    const v1 = realLike({ clubs: 3 });
    const v2p = clone(v1); v2p.manifest.version = '1.1.0';
    v2p.editions[0]!.clubIds = [v1.clubs[0]!.id, v1.clubs[2]!.id];
    const d = diffPacks(v1, v2p);
    expect(d.editions.participants).toEqual([{ key: 'comp:alfa-liga@2026', joined: [], left: ['club:alfa-002'] }]);
    const r = importDatapack(asFiles(v2p), { installed: v1 });
    expect(r.status).toBe('update');
  });
  it('diff entre versões idênticas é vazio; sem versão anterior tudo é "adicionado"', () => {
    const p = realLike();
    expect(isEmptyDiff(diffPacks(p, clone(p)))).toBe(true);
    const first = diffPacks(null, p);
    expect(first.fromVersion).toBeNull();
    expect(first.players.added).toHaveLength(30);
  });
  it('pacote que diz substituir outra versão avisa se não bate com a instalada', () => {
    const store = createPackStore();
    store.importFiles(asFiles(realLike()));
    const p = realLike({ version: '1.1.0' }); p.manifest.previousVersion = '0.9.0';
    const r = store.importFiles(asFiles(p));
    expect(r.status).toBe('update');
    expect(codes(r, 'warning')).toContain('previous_version_mismatch');
  });
  it('pacotes de packIds diferentes convivem; ids repetidos entre eles são recusados', () => {
    const store = createPackStore();
    store.importFiles(asFiles(realLike()));
    const other = JSON.parse(JSON.stringify(realLike()).replace(/alfa/g, 'beta').replace(/Alfa/g, 'Beta')) as Datapack;
    expect(store.importFiles(asFiles(other)).status).toBe('new');
    expect(store.list()).toHaveLength(2);
    const clash = realLike(); clash.manifest.packId = 'pacote-gama';
    const r = store.importFiles(asFiles(clash));
    expect(r.status).toBe('rejected');
    expect(codes(r, 'error')).toContain('id_collision_other_pack');
    expect(store.list()).toHaveLength(2);
  });
});

describe('Identidade de jogadores', () => {
  const P = (id: string, name: string, extra: Partial<Player> = {}): Player => ({ id: id as Player['id'], name, position: 'CM', overall: 60, ...extra });
  it('nome igual sozinho nunca é candidato', () => {
    const r = findInternalDuplicates('a', [P('plr:a1', 'João Silva'), P('plr:a2', 'Joao Silva')]);
    expect(r.total).toBe(0);
  });
  it('nome + nascimento = provável; sem acento e maiúsculas contam', () => {
    const r = findInternalDuplicates('a', [P('plr:a1', 'João Silva', { birthDate: '2001-02-03' }), P('plr:a2', 'JOAO SILVA', { birthDate: '2001-02-03' })]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]).toMatchObject({ kind: 'name_and_birth', confidence: 'probable' });
    expect(normalizeName('  João  Silva ')).toBe('joao silva');
  });
  it('nome + nacionalidade é só "possível" e some se o nascimento os distingue', () => {
    const a = P('plr:a1', 'Pedro Lima', { nationalityId: 'ctry:br', birthDate: '2000-01-01' });
    const same = P('plr:a2', 'Pedro Lima', { nationalityId: 'ctry:br' });
    const other = P('plr:a3', 'Pedro Lima', { nationalityId: 'ctry:br', birthDate: '1990-01-01' });
    const r = findInternalDuplicates('a', [a, same, other]);
    expect(r.candidates.every((c) => c.confidence === 'possible')).toBe(true);
    expect(r.candidates.map((c) => [c.a, c.b].sort().join('~'))).toEqual(['plr:a1~plr:a2', 'plr:a2~plr:a3']);
  });
  it('mesmo id externo com ids estáveis diferentes é provável', () => {
    const r = findInternalDuplicates('a', [P('plr:a1', 'X', { externalIds: { apiFootball: 10 } }), P('plr:a2', 'Y', { externalIds: { apiFootball: 10 } }), P('plr:a3', 'Z', { externalIds: { apiFootball: 11 } })]);
    expect(r.candidates).toEqual([expect.objectContaining({ kind: 'external_id', confidence: 'probable' })]);
  });
  it('o mesmo id em outra versão/clube é o MESMO jogador, não candidato', () => {
    const old = [P('plr:a1', 'Ana', { clubId: 'club:x', birthDate: '2000-01-01' })];
    const neu = [P('plr:a1', 'Ana', { clubId: 'club:y', birthDate: '2000-01-01' })];
    expect(findDuplicateCandidates(neu, buildIdentityIndex([{ packId: 'a', players: old }]), 'a').total).toBe(0);
  });
  it('re-identificação entre versões: jogador some e reaparece com outro id → candidato, nada é unido', () => {
    const store = createPackStore();
    const v1 = realLike();
    v1.players[0]!.birthDate = '1999-09-09'; delete v1.players[0]!.age;
    store.importFiles(asFiles(v1));
    const v2p = clone(v1); v2p.manifest.version = '1.1.0';
    const old = v2p.players[0]!;
    old.id = 'plr:alfa-renomeado';
    const r = store.importFiles(asFiles(v2p));
    expect(r.status).toBe('update');
    expect(r.duplicates.some((d) => d.kind === 'name_and_birth' && d.sourceOfB.startsWith('pacote-alfa@1.0.0'))).toBe(true);
    expect(r.diff!.players.added).toEqual(['plr:alfa-renomeado']);
    expect(r.diff!.players.disappeared).toEqual([v1.players[0]!.id]);
  });
  it('duplicatas entre pacotes diferentes viram avisos', () => {
    const store = createPackStore();
    const a = realLike(); a.players[0]!.birthDate = '1995-04-04'; delete a.players[0]!.age; a.players[0]!.name = 'Zé Comum';
    store.importFiles(asFiles(a));
    const b = JSON.parse(JSON.stringify(realLike()).replace(/alfa/g, 'beta').replace(/Alfa/g, 'Beta')) as Datapack;
    b.players[0]!.birthDate = '1995-04-04'; delete b.players[0]!.age; b.players[0]!.name = 'Zé Comum';
    const r = store.importFiles(asFiles(b));
    expect(r.status).toBe('new');
    expect(codes(r, 'warning')).toContain('possible_duplicate_player');
    expect(r.duplicates[0]!.sourceOfB).toBe('pacote-alfa');
  });
});

describe('Relatórios', () => {
  it('tem erros, avisos e informações separados, com etapa e caminho', () => {
    const p = realLike({ playersPerClub: 3 });
    p.clubs[0]!.legacyId = 'nao-existe';
    const r = importDatapack(asFiles(p), { gameClubs: [{ id: 'x', name: 'X' }] });
    expect(r.report.ok).toBe(true);
    expect(r.report.warnings).toBeGreaterThan(0);
    expect(issuesOf(r.report, 'warning').every((i) => i.stage && i.code)).toBe(true);
    expect(r.report.issues.find((i) => i.code === 'legacy_club_unknown')).toMatchObject({ stage: 'reconcile', severity: 'warning' });
  });
  it('resumo mostra REJEITADA e os primeiros erros', () => {
    const p = realLike(); delete p.manifest.source;
    const r = importDatapack(asFiles(p));
    expect(summarizeReport(r.report)).toContain('REJEITADA');
    expect(summarizeReport(r.report)).toContain('missing_license');
  });
});

describe('Desempenho defensivo', () => {
  it('pacote hostil com o mesmo id externo/nome em milhares de jogadores não vira custo quadrático', () => {
    const p = realLike({ clubs: 20, playersPerClub: 100 }); // 2000 jogadores
    for (const x of p.players) { x.name = 'Mesmo Nome'; x.externalIds = { apiFootball: 1 }; x.birthDate = '2000-01-01'; delete x.age; }
    const t0 = Date.now();
    const r = importDatapack(asFiles(p));
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(r.report.ok).toBe(true);
    expect(codes(r, 'warning')).toContain('duplicate_scan_skipped');
  });
});
