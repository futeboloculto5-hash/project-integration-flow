import { describe, expect, it } from 'vitest';
import { readFileList, readNativeBundle, type PackFile } from './bundle';
import { createAdapterRegistry, defaultRegistry, nativeAdapter, type DatapackAdapter } from './adapters';
import { ReportBuilder, hasCode, summarizeReport } from './report';
import { testPack } from './fixtures';
import { validateDatapack } from './validate';

const f = (name: string, text: string): PackFile => ({ name, text });
const jl = (items: unknown[]) => items.map((i) => JSON.stringify(i)).join('\n');

/** Pacote de teste dividido em arquivos, como seria entregue em disco. */
function splitFiles(): PackFile[] {
  const p = testPack({ clubs: 3, playersPerClub: 2 });
  return [
    f('manifest.json', JSON.stringify(p.manifest)),
    f('countries.json', JSON.stringify(p.countries)),
    f('competitions.json', JSON.stringify(p.competitions)),
    f('editions.json', JSON.stringify(p.editions)),
    f('clubs.ndjson', jl(p.clubs)),
    f('players-001.json', JSON.stringify(p.players.slice(0, 3))),
    f('players-002.ndjson', jl(p.players.slice(3))),
  ];
}

describe('Datapack · bundle', () => {
  it('lê datapack.json único', () => {
    const p = testPack();
    const r = readNativeBundle([f('datapack.json', JSON.stringify(p))]);
    expect(r.issues).toEqual([]);
    expect(r.pack).toEqual(p);
  });
  it('lê pacote dividido (JSON + NDJSON, vários arquivos de jogadores) e o resultado valida igual ao original', () => {
    const r = readNativeBundle(splitFiles());
    expect(r.issues).toEqual([]);
    const v = validateDatapack(r.pack);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.pack.players).toHaveLength(6);
  });
  it('aceita BOM no início e pasta players/', () => {
    const p = testPack({ clubs: 1, playersPerClub: 2 });
    const r = readNativeBundle([
      f('manifest.json', '﻿' + JSON.stringify(p.manifest)), f('countries.json', JSON.stringify(p.countries)),
      f('competitions.json', JSON.stringify(p.competitions)), f('editions.json', JSON.stringify(p.editions)),
      f('clubs.json', JSON.stringify(p.clubs)), f('dados/players/br.json', JSON.stringify(p.players)),
    ]);
    expect(r.issues).toEqual([]);
    expect(validateDatapack(r.pack).ok).toBe(true);
  });
  it('JSON inválido: erro com o nome do arquivo e nenhum pacote parcial', () => {
    const files = splitFiles();
    files[3] = f('editions.json', '{ quebrado');
    const r = readNativeBundle(files);
    expect(r.pack).toBeUndefined();
    expect(r.issues.some((i) => i.code === 'bad_json' && i.path === 'editions.json')).toBe(true);
  });
  it('NDJSON com linha ruim: aponta a linha e rejeita tudo', () => {
    const files = splitFiles();
    files[4] = f('clubs.ndjson', '{"id":"club:a"}\nnão é json\n{"id":"club:b"}');
    const r = readNativeBundle(files);
    expect(r.pack).toBeUndefined();
    expect(r.issues.find((i) => i.code === 'bad_json_line')?.path).toBe('clubs.ndjson:2');
  });
  it('limita quantos erros de linha são listados', () => {
    const files = splitFiles();
    files[4] = f('clubs.ndjson', Array.from({ length: 50 }, () => 'x').join('\n'));
    const r = readNativeBundle(files);
    expect(r.issues.length).toBeLessThanOrEqual(6);
    expect(r.issues.some((i) => /50 linhas inválidas/.test(i.message))).toBe(true);
  });
  it('tabela que não é lista é erro', () => {
    const files = splitFiles();
    files[1] = f('countries.json', '{"a":1}');
    expect(readNativeBundle(files).issues.some((i) => i.code === 'not_a_list')).toBe(true);
  });
  it('sem manifesto: erro claro', () => {
    expect(readNativeBundle(splitFiles().slice(1)).issues.map((i) => i.code)).toContain('no_manifest');
  });
  it('arquivo repetido e tabela repetida são erros', () => {
    const files = splitFiles();
    expect(readNativeBundle([...files, f('Clubs.NDJSON', '')]).issues.map((i) => i.code)).toContain('duplicate_file');
    expect(readNativeBundle([...files, f('clubs.json', '[]')]).issues.map((i) => i.code)).toContain('duplicate_table');
  });
  it('arquivos desconhecidos só geram aviso; nunca viram dados', () => {
    const r = readNativeBundle([...splitFiles(), f('LEIAME.txt', 'oi'), f('extra.json', '[1]')]);
    expect(r.pack).toBeDefined();
    expect(r.ignoredFiles).toEqual(['LEIAME.txt', 'extra.json']);
    expect(r.issues.every((i) => i.severity === 'warning')).toBe(true);
  });
  it('jogador repetido em dois arquivos continua sendo pego pelo validador (id duplicado)', () => {
    const files = splitFiles();
    const p = testPack({ clubs: 3, playersPerClub: 2 });
    files.push(f('players-003.json', JSON.stringify([p.players[0]])));
    const v = validateDatapack(readNativeBundle(files).pack);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.code === 'duplicate_id')).toBe(true);
  });
  it('readFileList lê objetos tipo File, usa o caminho relativo e relata falhas sem lançar', async () => {
    const ok = { name: 'a.json', webkitRelativePath: 'pack/a.json', text: async () => '[]' };
    const bad = { name: 'b.json', text: async () => { throw new Error('x'); } };
    const big = { name: 'c.json', size: 999_999_999_999, text: async () => '' };
    const r = await readFileList([ok, bad, big]);
    expect(r.files).toEqual([{ name: 'pack/a.json', text: '[]' }]);
    expect(r.issues.map((i) => i.code).sort()).toEqual(['file_too_large', 'file_unreadable']);
  });
});

describe('Datapack · adaptadores', () => {
  it('o nativo reconhece datapack.json e pacote dividido; não reconhece o resto', () => {
    expect(nativeAdapter.detect([f('datapack.json', JSON.stringify(testPack()))]).match).toBe(true);
    expect(nativeAdapter.detect(splitFiles()).match).toBe(true);
    expect(nativeAdapter.detect([f('datapack.json', '{"manifest":{"schema":"outra.coisa"}}')]).match).toBe(false);
    expect(nativeAdapter.detect([f('dados.csv', 'a;b')]).match).toBe(false);
    expect(nativeAdapter.detect([f('manifest.json', '{"schema":"outro"}')]).match).toBe(false);
    expect(nativeAdapter.detect([f('datapack.json', 'lixo')]).match).toBe(false);
  });
  it('reconhece o marcador mesmo quando ele não está no começo de um arquivo grande', () => {
    const p = testPack({ clubs: 400, playersPerClub: 3 });
    const text = JSON.stringify({ countries: p.countries, competitions: p.competitions, editions: p.editions, clubs: p.clubs, players: p.players, manifest: p.manifest });
    expect(text.length).toBeGreaterThan(64 * 1024);
    expect(nativeAdapter.detect([f('datapack.json', text)]).match).toBe(true);
  });
  it('convert devolve o contrato cru e nunca valida por conta própria', () => {
    const bad = { manifest: { schema: 'ccw.datapack' }, clubs: 'nada' };
    const r = nativeAdapter.convert([f('datapack.json', JSON.stringify(bad))]);
    expect(r.pack).toEqual(bad); // a rejeição é do validador, não do adaptador
  });
  it('o registro padrão só tem o nativo; formato desconhecido lista os suportados', () => {
    expect(defaultRegistry.list().map((a) => a.id)).toEqual(['ccw-native-v1']);
    const r = defaultRegistry.pick([f('dados.xml', '<x/>')]);
    expect('error' in r && r.error.code).toBe('unknown_format');
    expect('error' in r && r.error.message).toContain('ccw-native-v1');
  });
  it('formato forçado inexistente ou incompatível é recusado', () => {
    expect('error' in defaultRegistry.pick(splitFiles(), 'xyz') && 'unknown_format_id').toBe('unknown_format_id');
    const r = defaultRegistry.pick([f('dados.csv', '')], 'ccw-native-v1');
    expect('error' in r && r.error.code).toBe('format_mismatch');
  });
  it('registro aceita outro adaptador sem mexer no nativo e recusa ids repetidos e ambiguidade', () => {
    const fake: DatapackAdapter = {
      id: 'fake-csv', label: 'CSV de teste (somente nos testes)',
      detect: (files) => ({ match: files.some((x) => x.name.endsWith('.csv')) }),
      convert: () => ({ pack: testPack(), issues: [] }),
    };
    const reg = createAdapterRegistry([nativeAdapter, fake]);
    const a = reg.pick([f('x.csv', 'a')]);
    expect('adapter' in a && a.adapter.id).toBe('fake-csv');
    const b = reg.pick(splitFiles());
    expect('adapter' in b && b.adapter.id).toBe('ccw-native-v1');
    expect(() => createAdapterRegistry([nativeAdapter, nativeAdapter])).toThrow();
    const greedy: DatapackAdapter = { ...fake, id: 'guloso', detect: () => ({ match: true }) };
    const amb = createAdapterRegistry([nativeAdapter, greedy]).pick(splitFiles());
    expect('error' in amb && amb.error.code).toBe('ambiguous_format');
  });
});

describe('Datapack · relatório', () => {
  it('conta exato mesmo cortando a lista, e só erros rejeitam', () => {
    const b = new ReportBuilder();
    for (let i = 0; i < 700; i++) b.warn('validate', 'w', `p${i}`, 'x');
    b.info('diff', 'i', '', 'y');
    expect(b.hasErrors).toBe(false);
    let r = b.build();
    expect(r.ok).toBe(true);
    expect(r.warnings).toBe(700);
    expect(r.issues).toHaveLength(500);
    expect(r.truncated).toBe(true);
    b.error('policy', 'e', '', 'z');
    r = b.build();
    expect(r.ok).toBe(false);
    expect(r.errors).toBe(1);
    expect(hasCode(r, 'e')).toBe(false); // cortado da lista, mas contado
    expect(summarizeReport(r)).toContain('REJEITADA');
  });
});
