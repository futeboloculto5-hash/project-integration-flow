import { describe, expect, it } from 'vitest';
import { createPackStore } from './store';
import { importDatapack } from './import';
import { compareClubClaims, comparePlayerClaims } from './shared';
import { aliasMap, canonicalId, cloneLedger, createLedger, linkIds, parseLedger, recordPack } from './identity-ledger';
import { resolveWorld } from './world';
import { validateDatapack } from './validate';
import type { Club, Datapack, Player } from './types';
import type { PackFile } from './bundle';

const asFiles = (p: unknown): PackFile[] => [{ name: 'datapack.json', text: JSON.stringify(p) }];
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const codes = (r: { report: { issues: { code: string; severity: string }[] } }, sev?: string) => r.report.issues.filter((i) => !sev || i.severity === sev).map((i) => i.code);

/** Pacote SINTÉTICO por "país" (código curto). Nomes e ids são inventados pelos testes; não representam nada real. */
function mk(code: string, o: { clubs?: number; per?: number; version?: string; createdAt?: string } = {}): Datapack {
  const clubsN = o.clubs ?? 2, per = o.per ?? 12;
  const cid = `ctry:${code}` as const;
  const clubs: Club[] = Array.from({ length: clubsN }, (_, i) => ({ id: `club:${code}-${i + 1}` as const, name: `Clube ${code.toUpperCase()}${i + 1}`, countryId: cid }));
  const players: Player[] = clubs.flatMap((c, i) => Array.from({ length: per }, (_, j) => ({
    id: `plr:${code}-${i + 1}-${j + 1}` as const, name: `Atleta ${code.toUpperCase()}${i + 1}x${j + 1}`, position: (['GK', 'CB', 'CM', 'ST'] as const)[j % 4]!,
    clubId: c.id, overall: 50 + j, birthDate: `199${j % 10}-0${(i % 9) + 1}-1${j % 9}`, nationalityId: cid,
  })));
  return {
    manifest: { schema: 'ccw.datapack', schemaVersion: 1, packId: `pacote-${code}`, version: o.version ?? '1.0.0', name: `Pacote ${code}`, createdAt: o.createdAt ?? '2026-01-01', origin: 'comunitario',
      source: { name: 'Gerador sintético dos testes', license: 'Uso interno de testes' }, counts: { countries: 1, competitions: 1, clubs: clubs.length, players: players.length, editions: 1 } },
    countries: [{ id: cid, name: `País ${code.toUpperCase()}` }],
    competitions: [{ id: `comp:liga-${code}`, name: `Liga ${code}`, countryId: cid, kind: 'league', tier: 1 }],
    editions: [{ competitionId: `comp:liga-${code}`, season: '2026', clubIds: clubs.map((c) => c.id) }],
    clubs, players,
  };
}
const recount = (p: Datapack) => { p.manifest.counts = { countries: p.countries.length, competitions: p.competitions.length, clubs: p.clubs.length, players: p.players.length, editions: p.editions.length }; return p; };
/** Leva um clube (e o país dele) de `from` para dentro de `into`, como numa competição internacional. */
function shareClub(into: Datapack, from: Datapack, clubId: string) {
  const c = from.clubs.find((x) => x.id === clubId)!;
  if (!into.countries.some((x) => x.id === c.countryId)) into.countries.push(clone(from.countries.find((x) => x.id === c.countryId)!));
  into.clubs.push(clone(c));
  into.editions[0]!.clubIds.push(c.id);
  recount(into);
}
/** Leva um jogador de `from` para `into` (ex.: transferido para um clube do outro país). */
function sharePlayer(into: Datapack, from: Datapack, playerId: string, toClub: string) {
  const p = clone(from.players.find((x) => x.id === playerId)!);
  p.clubId = toClub as Player['clubId'];
  if (p.nationalityId && !into.countries.some((x) => x.id === p.nationalityId)) into.countries.push(clone(from.countries.find((x) => x.id === p.nationalityId)!));
  into.players.push(p);
  recount(into);
}

describe('Fase 1 · pacotes por país compartilham referências sem duplicar', () => {
  function two() {
    const a = mk('a'), b = mk('b');
    shareClub(b, a, 'club:a-1'); // clube do país A numa competição do B
    sharePlayer(b, a, 'plr:a-1-1', 'club:b-1'); // jogador do A que joga no B
    return { a, b };
  }
  it('importar os dois pacotes funciona; ids compartilhados são contados uma vez', () => {
    const { a, b } = two();
    const store = createPackStore();
    expect(store.importFiles(asFiles(a)).report.errors).toBe(0);
    const r = store.importFiles(asFiles(b));
    expect(r.report.errors).toBe(0);
    expect(r.status).toBe('new');
    expect(r.shared).toMatchObject({ clubs: 1, players: 1, withPacks: ['pacote-a'] });
    expect(r.shared!.sportingDifferences).toBe(1); // o jogador mudou de clube entre pacotes
    expect(r.duplicatesTotal).toBe(0);
    const w = store.world();
    expect(w.clubs.filter((c) => c.id === 'club:a-1')).toHaveLength(1);
    expect(w.players.filter((p) => p.id === 'plr:a-1-1')).toHaveLength(1);
    expect(w.players).toHaveLength(a.players.length + b.players.length - 1);
  });
  it('a ordem de instalação não muda o resultado (precedência determinística)', () => {
    const { a, b } = two();
    const s1 = createPackStore(); s1.importFiles(asFiles(a)); s1.importFiles(asFiles(b));
    const s2 = createPackStore(); s2.importFiles(asFiles(b)); s2.importFiles(asFiles(a));
    const norm = (s: ReturnType<typeof createPackStore>) => { const w = s.world(); return JSON.stringify([w.players.map((p) => [p.id, p.clubId, p.overall]).sort(), w.clubs.map((c) => c.id).sort(), [...w.playerOrigin].sort()]); };
    expect(norm(s1)).toBe(norm(s2));
  });
  it('vence a maior prioridade; empate: pacote mais recente; depois packId', () => {
    const { a, b } = two();
    const store = createPackStore();
    store.importFiles(asFiles(a)); store.importFiles(asFiles(b));
    // empate de prioridade e de data → packId alfabético: "pacote-a" vence
    expect(store.world().playerOrigin.get('plr:a-1-1')).toBe('pacote-a');
    expect(store.world().players.find((p) => p.id === 'plr:a-1-1')!.clubId).toBe('club:a-1');
    store.setPriority('pacote-b', 5);
    expect(store.world().playerOrigin.get('plr:a-1-1')).toBe('pacote-b');
    expect(store.world().players.find((p) => p.id === 'plr:a-1-1')!.clubId).toBe('club:b-1');
    store.setPriority('pacote-b', 0);
    // data mais recente vence o empate de prioridade
    const newer = clone(b); newer.manifest.createdAt = '2026-06-01'; newer.manifest.version = '1.0.1';
    store.importFiles(asFiles(newer));
    expect(store.world().playerOrigin.get('plr:a-1-1')).toBe('pacote-b');
  });
  it('a proveniência mostra quem venceu e o que diverge', () => {
    const { a, b } = two();
    const store = createPackStore(); store.importFiles(asFiles(a)); store.importFiles(asFiles(b));
    const pv = store.world().shared.players.get('plr:a-1-1')!;
    expect(pv.winner).toBe('pacote-a');
    expect(pv.alsoIn).toEqual(['pacote-b']);
    expect(pv.differs[0]!.fields).toContain('clubId');
    expect(store.world().shared.clubs.get('club:a-1')!.alsoIn).toEqual(['pacote-b']);
  });
  it('o jogador compartilhado não aparece duplicado quando um dos pacotes é atualizado', () => {
    const { a, b } = two();
    const store = createPackStore(); store.importFiles(asFiles(a)); store.importFiles(asFiles(b));
    const a2 = clone(a); a2.manifest.version = '1.1.0'; a2.players[0]!.overall = 88;
    expect(store.importFiles(asFiles(a2)).status).toBe('update');
    expect(store.world().players.filter((p) => p.id === 'plr:a-1-1')).toHaveLength(1);
    expect(store.world().players.find((p) => p.id === 'plr:a-1-1')!.overall).toBe(88);
  });
  it('quem sai de um pacote mas continua em outro não fica "aposentado"', () => {
    const { a, b } = two();
    const store = createPackStore(); store.importFiles(asFiles(a)); store.importFiles(asFiles(b));
    const a2 = clone(a); a2.manifest.version = '1.1.0'; a2.players = a2.players.filter((p) => p.id !== 'plr:a-1-1'); recount(a2);
    store.importFiles(asFiles(a2));
    expect(store.get('pacote-a')!.retired.map((r) => r.player.id)).toEqual(['plr:a-1-1']); // aposentado no pacote A…
    expect(store.world().retired.map((r) => r.player.id)).toEqual([]); // …mas vivo no B, então não conta como aposentado no mundo
    expect(store.world().players.some((p) => p.id === 'plr:a-1-1')).toBe(true);
  });
});

describe('Fase 1 · o mesmo id só é aceito para a mesma entidade', () => {
  const importB = (mutate: (b: Datapack, a: Datapack) => void) => {
    const a = mk('a'), b = mk('b');
    shareClub(b, a, 'club:a-1'); sharePlayer(b, a, 'plr:a-1-2', 'club:b-1');
    mutate(b, a);
    const store = createPackStore(); store.importFiles(asFiles(a));
    return { store, r: store.importFiles(asFiles(b)) };
  };
  it('jogador com outro nome e outro nascimento: erro, nada é unido', () => {
    const { store, r } = importB((b) => { const p = b.players.find((x) => x.id === 'plr:a-1-2')!; p.name = 'Outra Pessoa'; p.birthDate = '1980-01-01'; });
    expect(r.status).toBe('rejected');
    expect(codes(r, 'error')).toContain('identity_conflict');
    expect(r.report.issues.find((i) => i.code === 'identity_conflict')!.message).toContain('nascimento diferente');
    expect(store.list()).toHaveLength(1);
  });
  it('mesmo id e nomes diferentes, sem dado que corrobore: erro (ambíguo = rejeita)', () => {
    const { r } = importB((b) => { const p = b.players.find((x) => x.id === 'plr:a-1-2')!; p.name = 'Nome Totalmente Diferente'; delete p.birthDate; delete p.nationalityId; p.age = 25; });
    expect(codes(r, 'error')).toContain('identity_conflict');
  });
  it('nome diferente, mas nascimento e nacionalidade batem: aceito com aviso', () => {
    const { r } = importB((b) => { b.players.find((x) => x.id === 'plr:a-1-2')!.name = 'Atleta A1x2 (grafia nova)'; });
    expect(r.status).toBe('new');
    expect(codes(r, 'warning')).toContain('shared_identity_note');
  });
  it('nacionalidade diferente: erro', () => {
    const { r } = importB((b) => { b.players.find((x) => x.id === 'plr:a-1-2')!.nationalityId = 'ctry:b'; });
    expect(codes(r, 'error')).toContain('identity_conflict');
  });
  it('id externo contraditório e legacyId contraditório: erro', () => {
    const a = mk('a'), b = mk('b');
    a.players[0]!.externalIds = { fonte: 1 }; a.players[0]!.legacyId = 'velho-1';
    sharePlayer(b, a, a.players[0]!.id, 'club:b-1');
    b.players[b.players.length - 1]!.externalIds = { fonte: 2 };
    const store = createPackStore(); store.importFiles(asFiles(a));
    expect(codes(store.importFiles(asFiles(b)), 'error')).toContain('identity_conflict');
    const c = mk('b'); sharePlayer(c, a, a.players[0]!.id, 'club:b-1'); c.players[c.players.length - 1]!.legacyId = 'velho-2';
    expect(codes(store.importFiles(asFiles(c)), 'error')).toContain('identity_conflict');
  });
  it('clube com o mesmo id mas outro nome: erro; com o outro nome em aliases: aceito', () => {
    const { r } = importB((b) => { b.clubs.find((x) => x.id === 'club:a-1')!.name = 'Time Completamente Diferente'; });
    expect(codes(r, 'error')).toContain('identity_conflict');
    const { r: ok } = importB((b) => { const c = b.clubs.find((x) => x.id === 'club:a-1')!; c.name = 'Nome Alternativo FC'; c.aliases = ['Clube A1']; });
    expect(ok.status).toBe('new');
  });
  it('clube com outro país ou outro legacyId: erro', () => {
    const { r } = importB((b) => { b.clubs.find((x) => x.id === 'club:a-1')!.countryId = 'ctry:b'; });
    expect(codes(r, 'error')).toContain('identity_conflict');
    const a = mk('a'); a.clubs[0]!.legacyId = 'fla';
    const b = mk('b'); shareClub(b, a, 'club:a-1'); b.clubs[b.clubs.length - 1]!.legacyId = 'outro';
    const store = createPackStore(); store.importFiles(asFiles(a));
    expect(codes(store.importFiles(asFiles(b)), 'error')).toContain('identity_conflict');
  });
  it('comparadores puros', () => {
    const p: Player = { id: 'plr:x', name: 'João da Silva', position: 'CM', overall: 60, birthDate: '2000-02-02' };
    expect(comparePlayerClaims(p, { ...p, name: 'JOAO DA SILVA' })).toEqual({ same: true, notes: [] });
    expect(comparePlayerClaims(p, { ...p, birthDate: '2000-02-03' }).same).toBe(false);
    expect(comparePlayerClaims({ ...p, age: 20 }, { ...p, birthDate: undefined, age: 25 } as Player).same).toBe(false); // idades 20 × 25 não combinam
    expect(comparePlayerClaims({ ...p, age: 20 }, { ...p, birthDate: undefined, age: 21 } as Player).same).toBe(true); // temporadas diferentes: até 2 anos de diferença é tolerado
    const c: Club = { id: 'club:x', name: 'Clube X', countryId: 'ctry:a' };
    expect(compareClubClaims(c, { ...c, name: 'clube x' }).same).toBe(true);
    expect(compareClubClaims(c, { ...c, name: 'Outro' }).same).toBe(false);
  });
});

describe('Fase 1 · nome igual nunca une ninguém', () => {
  it('pessoas diferentes (ids diferentes) com o mesmo nome e nascimento ficam separadas e geram candidato', () => {
    const a = mk('a'), b = mk('b');
    b.players[0]!.name = a.players[0]!.name; b.players[0]!.birthDate = a.players[0]!.birthDate;
    const store = createPackStore(); store.importFiles(asFiles(a));
    const r = store.importFiles(asFiles(b));
    expect(r.status).toBe('new');
    expect(codes(r, 'warning')).toContain('possible_duplicate_player');
    expect(store.world().players).toHaveLength(a.players.length + b.players.length); // nada foi unido
  });
});

describe('Fase 1 · livro de identidade e ligações confirmadas', () => {
  it('registra histórico: nomes, pacotes e primeira aparição', () => {
    const a = mk('a');
    const store = createPackStore(); store.importFiles(asFiles(a));
    const a2 = clone(a); a2.manifest.version = '1.1.0'; a2.players[0]!.name = 'Atleta Renomeado';
    store.importFiles(asFiles(a2));
    const e = store.ledger().entities[a.players[0]!.id]!;
    expect(e.names).toEqual([a.players[0]!.name, 'Atleta Renomeado']);
    expect(e.firstSeen).toEqual({ packId: 'pacote-a', version: '1.0.0' });
    expect(e.sources).toEqual([{ packId: 'pacote-a', version: '1.1.0' }]);
    expect(store.ledger().entities['club:a-1']!.kind).toBe('club');
  });
  it('importação rejeitada não mexe no livro', () => {
    const store = createPackStore(); store.importFiles(asFiles(mk('a')));
    const before = JSON.stringify(store.ledger());
    const bad = mk('b'); bad.players[0]!.clubId = 'club:fantasma';
    expect(store.importFiles(asFiles(bad)).status).toBe('rejected');
    expect(JSON.stringify(store.ledger())).toBe(before);
  });
  it('ligação confirmada: o id antigo vira alias do canônico, sem alterar pacotes', () => {
    const a = mk('a'), a2 = clone(a); a2.manifest.version = '1.1.0';
    const old = a.players[0]!, renamed = a2.players[0]!; renamed.id = 'plr:a-renomeado';
    const store = createPackStore(); store.importFiles(asFiles(a)); store.importFiles(asFiles(a2));
    expect(store.link(old.id, 'plr:a-renomeado', 'O pacote trocou o id deste jogador na v1.1.0')).toEqual({ ok: true });
    const w = store.world();
    expect(w.aliases.get(old.id)).toBe('plr:a-renomeado');
    expect(w.players.some((p) => p.id === old.id)).toBe(false);
    expect(w.retired.some((r) => r.player.id === old.id)).toBe(false); // não é mais "aposentado": é o mesmo jogador
    expect(w.players.some((p) => p.id === 'plr:a-renomeado')).toBe(true);
    expect(store.get('pacote-a')!.pack.players.some((p) => p.id === 'plr:a-renomeado')).toBe(true); // pacote intacto
  });
  it('ligação entre dois jogadores ativos em pacotes diferentes: só o canônico é listado', () => {
    const a = mk('a'), b = mk('b');
    const oldP = a.players[0]!; const newP = clone(oldP); newP.id = 'plr:b-mesmo-jogador'; newP.clubId = 'club:b-1'; b.players.push(newP); recount(b);
    b.countries.push(clone(a.countries[0]!)); recount(b);
    const store = createPackStore(); store.importFiles(asFiles(a));
    const r = store.importFiles(asFiles(b));
    expect(codes(r, 'warning')).toContain('possible_duplicate_player'); // o sistema só aponta; não une
    expect(store.world().players.filter((p) => p.name === oldP.name)).toHaveLength(2);
    expect(store.link(oldP.id, newP.id, 'revisado: é o mesmo jogador, com id diferente nos dois pacotes').ok).toBe(true);
    const w = store.world();
    expect(w.players.filter((p) => p.name === oldP.name).map((p) => p.id)).toEqual([newP.id]);
    expect(w.aliases.get(oldP.id)).toBe(newP.id);
  });
  it('a prioridade do pacote é mantida quando ele é atualizado', () => {
    const store = createPackStore(); const a = mk('a');
    store.importFiles(asFiles(a), { priority: 7 });
    const a2 = clone(a); a2.manifest.version = '1.1.0';
    store.importFiles(asFiles(a2));
    expect(store.get('pacote-a')!.priority).toBe(7);
    const a3 = clone(a); a3.manifest.version = '1.2.0';
    store.importFiles(asFiles(a3), { priority: 2 });
    expect(store.get('pacote-a')!.priority).toBe(2);
  });
  it('ligação exige ids conhecidos, mesmo tipo, justificativa, sem ciclo e sem repetir origem', () => {
    const store = createPackStore(); store.importFiles(asFiles(mk('a')));
    const L = (f: string, t: string, n = 'motivo') => store.link(f, t, n);
    expect(L('plr:a-1-1', 'plr:a-1-1')).toMatchObject({ ok: false, code: 'same_id' });
    expect(L('plr:a-1-1', 'club:a-1')).toMatchObject({ ok: false, code: 'bad_kind' });
    expect(L('plr:a-1-1', 'plr:desconhecido')).toMatchObject({ ok: false, code: 'unknown_id' });
    expect(L('plr:a-1-1', 'plr:a-1-2', '  ')).toMatchObject({ ok: false, code: 'no_note' });
    expect(L('plr:a-1-1', 'plr:a-1-2')).toEqual({ ok: true });
    expect(L('plr:a-1-1', 'plr:a-1-3')).toMatchObject({ ok: false, code: 'already_linked' });
    expect(L('plr:a-1-2', 'plr:a-1-1')).toMatchObject({ ok: false, code: 'cycle' });
    expect(canonicalId(store.ledger(), 'plr:a-1-1')).toBe('plr:a-1-2');
  });
  it('correntes de ligação resolvem até o último id', () => {
    const l = createLedger(); recordPack(l, mk('a'));
    expect(linkIds(l, { from: 'plr:a-1-1', to: 'plr:a-1-2', note: 'x' }).ok).toBe(true);
    expect(linkIds(l, { from: 'plr:a-1-2', to: 'plr:a-1-3', note: 'y' }).ok).toBe(true);
    expect(canonicalId(l, 'plr:a-1-1')).toBe('plr:a-1-3');
    expect(aliasMap(l).get('plr:a-1-1')).toBe('plr:a-1-3');
  });
  it('ligação cujo destino não existe mais no mundo é ignorada com aviso', () => {
    const a = mk('a'), a2 = clone(a); a2.manifest.version = '1.1.0'; a2.players[0]!.id = 'plr:a-novo-id';
    const store = createPackStore(); store.importFiles(asFiles(a)); store.importFiles(asFiles(a2));
    expect(store.link('plr:a-1-1', 'plr:a-novo-id', 'trocou o id').ok).toBe(true);
    const a3 = clone(a2); a3.manifest.version = '1.2.0'; a3.players = a3.players.filter((p) => p.id !== 'plr:a-novo-id'); recount(a3);
    store.importFiles(asFiles(a3));
    const w = store.world();
    expect(w.aliases.has('plr:a-1-1')).toBe(false);
    expect(w.retired.some((r) => r.player.id === 'plr:a-1-1' || r.player.id === 'plr:a-novo-id')).toBe(true); // ninguém some: ficam aposentados
  });
  it('serializa e restaura o livro; recusa livro corrompido sem alterar o atual', () => {
    const store = createPackStore(); store.importFiles(asFiles(mk('a')));
    store.link('plr:a-1-1', 'plr:a-1-2', 'mesmo jogador');
    const saved = JSON.parse(JSON.stringify(store.ledger()));
    const other = createPackStore(); other.importFiles(asFiles(mk('a')));
    expect(other.restoreLedger(saved)).toEqual({ ok: true });
    expect(other.ledger().links).toEqual(store.ledger().links);
    const before = JSON.stringify(other.ledger());
    expect(other.restoreLedger({ ...saved, format: 9 }).ok).toBe(false);
    expect(other.restoreLedger({ ...saved, links: [{ from: 'plr:a-1-1', to: 'plr:a-1-1', note: 'x' }] }).ok).toBe(false);
    expect(other.restoreLedger(null).ok).toBe(false);
    expect(parseLedger({ format: 1, entities: {}, links: [{ from: 1 }] }).ok).toBe(false);
    expect(JSON.stringify(other.ledger())).toBe(before);
    const c = cloneLedger(saved); c.links.length = 0; expect(saved.links).toHaveLength(1); // clone independente
  });
  it('resolveWorld sem livro funciona e não devolve aliases', () => {
    const w = resolveWorld([{ pack: mk('a'), priority: 0, retired: [] }]);
    expect(w.aliases.size).toBe(0);
    expect(w.players).toHaveLength(24);
  });
});

describe('Fase 1 · contrato: legacyId opcional no jogador', () => {
  it('é aceito; repetido dentro do pacote é erro', () => {
    const a = mk('a'); a.players[0]!.legacyId = 'flamengo-s1-1';
    expect(validateDatapack(a).ok).toBe(true);
    a.players[1]!.legacyId = 'flamengo-s1-1';
    expect(validateDatapack(a).issues.some((i) => i.code === 'duplicate_legacy_id')).toBe(true);
  });
  it('pacote de um país importado sozinho continua sem nenhum compartilhamento', () => {
    const r = importDatapack(asFiles(mk('a')));
    expect(r.shared).toBeUndefined();
  });
});
