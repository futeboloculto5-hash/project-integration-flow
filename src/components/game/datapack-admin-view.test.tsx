import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DatapackAdminView, ImportReportView, LIST_LIMIT, PackDetailView, UpdatesView } from './datapack-admin-view';
import { adminSnapshot, checkForUpdates, summarizeImport, summarizePack } from '@/lib/datapack/admin-model';
import { createPackStore } from '@/lib/datapack/store';
import { importDatapack } from '@/lib/datapack/import';
import { syntheticSquadPack, testPack } from '@/lib/datapack/fixtures';
import type { Datapack } from '@/lib/datapack/types';

const clean = (html: string) => html.replace(/<!-- -->/g, '');
const files = (p: unknown) => [{ name: 'datapack.json', text: JSON.stringify(p) }];
const noop = () => {};
const props = (over: Partial<Parameters<typeof DatapackAdminView>[0]> = {}) => ({ snapshot: adminSnapshot(createPackStore()), selectedId: null, lastImport: null, updates: [], busy: false, onSelect: noop, onPickFiles: noop, onCheckUpdates: noop, ...over });
const view = (over = {}) => clean(renderToString(<DatapackAdminView {...props(over)} />));

describe('Administração de datapacks · tela', () => {
  it('sem pacotes: explica que o jogo usa os jogadores atuais e bloqueia a verificação de atualizações', () => {
    const html = view();
    expect(html).toContain('Nenhum datapack instalado');
    expect(html).toContain('jogadores atuais');
    expect(html).toMatch(/VERIFICAR ATUALIZAÇÕES<\/button>/);
    expect(html).toContain('disabled');
  });
  it('lista os pacotes com versão, temporada, quantidades e origem', () => {
    const store = createPackStore();
    store.importFiles(files(syntheticSquadPack({ clubs: ['alfa', 'beta'] })));
    const html = view({ snapshot: adminSnapshot(store) });
    expect(html).toContain('Pacote sintético de integração');
    expect(html).toContain('v1.0.0'); expect(html).toContain('2026'); expect(html).toContain('2 clubes'); expect(html).toContain('58 jogadores'); expect(html).toContain('Comunitário');
    expect(html).toContain('>VER<');
  });
  it('detalhe: país, competições, origem e licença', () => {
    const store = createPackStore();
    store.importFiles(files(syntheticSquadPack({ clubs: ['alfa'] })));
    const html = clean(renderToString(<PackDetailView pack={summarizePack(store.get('pacote-sintetico')!)} />));
    for (const t of ['País Sintético', 'CONMEBOL', 'Liga Sintética', 'Liga', 'divisão 1', 'temporada 2026', 'Fonte', 'Licença / autorização', 'Uso interno de testes', 'Versões instaladas']) expect(html).toContain(t);
    expect(html).not.toContain('Pacote de TESTE');
  });
  it('pacote de teste é marcado com aviso e licença ausente aparece como "não declarada"', () => {
    const store = createPackStore();
    store.importFiles(files(testPack({ playersPerClub: 15 })), { allowTestData: true });
    const html = view({ snapshot: adminSnapshot(store), selectedId: 'pacote-teste' });
    expect(html).toContain('Pacote de TESTE'); expect(html).toContain('não declarada'); expect(html).toContain('ABERTO');
    expect(html).toContain('Há pacote(s) de TESTE');
  });
  it('relatório de rejeição: erros e a garantia de que nada foi instalado', () => {
    const p = syntheticSquadPack({ clubs: ['alfa'] }); delete p.manifest.source;
    const html = clean(renderToString(<ImportReportView summary={summarizeImport(importDatapack(files(p)))} />));
    expect(html).toContain('REJEITADO'); expect(html).toContain('missing_license'); expect(html).toContain('rejeitado por inteiro'); expect(html).toContain('nenhuma carreira foi tocada');
    expect(html).not.toContain('O QUE MUDOU');
  });
  it('relatório de atualização: adicionados, alterados, transferidos e removidos', () => {
    const store = createPackStore();
    const v1 = syntheticSquadPack({ clubs: ['alfa', 'beta'] });
    store.importFiles(files(v1));
    const v2: Datapack = JSON.parse(JSON.stringify(v1)); v2.manifest.version = '1.1.0';
    v2.players[0]!.overall += 3; v2.players[1]!.clubId = 'club:sint-beta';
    const gone = v2.players.splice(2, 1)[0]!;
    v2.players.push({ id: 'plr:sint-novo', name: 'Atleta Sintético Novo', position: 'ST', clubId: 'club:sint-alfa', overall: 60, age: 20 });
    v2.manifest.counts.players = v2.players.length;
    const html = clean(renderToString(<ImportReportView summary={summarizeImport(store.importFiles(files(v2)), v1)} />));
    for (const t of ['ATUALIZAÇÃO', 'v1.0.0 → v1.1.0', 'ADICIONADOS', 'Atleta Sintético Novo', 'ALTERADOS', 'força', 'MUDARAM DE CLUBE', 'Clube Sintético alfa → Clube Sintético beta', 'SAÍRAM DO PACOTE', gone.name, 'continua guardado']) expect(html).toContain(t);
  });
  it('listas grandes são resumidas com o total real', () => {
    const p = syntheticSquadPack({ clubs: ['alfa', 'beta'], squad: 28 });
    const s = summarizeImport(importDatapack(files(p)), null, 500);
    expect(s.changes!.added.length).toBe(62); // sem limite no modelo
    const html = clean(renderToString(<ImportReportView summary={s} />));
    expect(html).toContain(`… e mais ${62 - LIST_LIMIT}`);
    expect((html.match(/<li/g) ?? []).length).toBeLessThanOrEqual(LIST_LIMIT + 5);
  });
  it('atualizações: disponível, em dia e catálogo mais antigo', () => {
    const store = createPackStore();
    store.importFiles(files(syntheticSquadPack({ clubs: ['alfa'] })));
    const text = (v: string) => clean(renderToString(<UpdatesView updates={checkForUpdates(store, [{ packId: 'pacote-sintetico', version: v }])} />));
    expect(text('1.3.0')).toContain('Atualização disponível: v1.0.0 → v1.3.0');
    expect(text('1.0.0')).toContain('Em dia');
    expect(text('0.5.0')).toContain('mais antiga');
    expect(clean(renderToString(<UpdatesView updates={[]} />))).toContain('Nenhuma verificação');
  });
  it('só usa classes visuais que o jogo já tem (identidade azul preservada)', () => {
    const store = createPackStore();
    store.importFiles(files(syntheticSquadPack({ clubs: ['alfa'] })));
    const html = view({ snapshot: adminSnapshot(store), selectedId: 'pacote-sintetico', updates: checkForUpdates(store, [{ packId: 'pacote-sintetico', version: '2.0.0' }]) });
    const css = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../styles.css'), 'utf8') as string;
    const used = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1]!.split(/\s+/)));
    const unknown = [...used].filter((c) => !css.includes(`.${c}`));
    expect(unknown).toEqual([]);
  });
});
