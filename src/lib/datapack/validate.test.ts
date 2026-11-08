import { describe, expect, it } from 'vitest';
import { LIMITS, isIsoDate, isValidDatapack, validateDatapack } from './validate';
import { testPack } from './fixtures';
import type { Datapack } from './types';

const clone = (): any => structuredClone(testPack());
const codes = (input: unknown, severity?: 'error' | 'warning') => validateDatapack(input).issues.filter(i => !severity || i.severity === severity).map(i => i.code);
const withChange = (fn: (p: any) => void) => { const p = clone(); fn(p); return p; };
const deepFreeze = <T,>(o: T): T => { if (o && typeof o === 'object') { Object.values(o as object).forEach(deepFreeze); Object.freeze(o); } return o; };

describe('Datapack · pacote válido', () => {
  it('aceita o pacote de teste e devolve estatísticas', () => {
    const r = validateDatapack(testPack());
    expect(r.ok).toBe(true); expect(r.stats).toEqual({ countries: 1, competitions: 1, clubs: 2, players: 4, editions: 1 });
    expect(isValidDatapack(testPack())).toBe(true);
  });
  it('pacote de teste gera aviso para nunca ser carregado num jogo real', () => {
    expect(codes(testPack(), 'warning')).toContain('pack_is_test_data'); expect(codes(testPack(), 'error')).toEqual([]);
  });
  it('não altera o objeto recebido (aceita dados congelados)', () => {
    const frozen = deepFreeze(clone());
    expect(() => validateDatapack(frozen)).not.toThrow(); expect(validateDatapack(frozen).ok).toBe(true);
  });
  it('campos desconhecidos viram aviso, não erro (compatível com versões futuras)', () => {
    const p = withChange(x => { x.clubs[0].novoCampo = 1; x.extra = []; });
    const r = validateDatapack(p); expect(r.ok).toBe(true); expect(codes(p, 'warning')).toContain('unknown_field');
  });
});

describe('Datapack · entradas inválidas nunca derrubam o validador', () => {
  it.each([[null], [undefined], [42], ['texto'], [[]], [true], [{ manifest: null }], [{ manifest: [] }], [{ manifest: { schema: 'outro' } }]])('rejeita %p sem lançar exceção', (input) => {
    expect(() => validateDatapack(input)).not.toThrow(); expect(validateDatapack(input).ok).toBe(false);
  });
  it('rejeita uma função como entrada', () => { expect(validateDatapack((() => 1) as unknown).ok).toBe(false); });
  it('rejeita listas com itens de tipos errados', () => {
    const p = withChange(x => { x.clubs = [null, 5, 'a', []]; x.players = [null]; x.countries = [7]; x.competitions = ['x']; x.editions = [[]]; x.manifest.counts = { countries: 1, competitions: 1, clubs: 4, players: 1, editions: 1 }; });
    const r = validateDatapack(p); expect(r.ok).toBe(false); expect(codes(p)).toContain('bad_record');
  });
  it('não é vulnerável a __proto__ no JSON', () => {
    const p = JSON.parse(JSON.stringify(clone()).replace('"packId"', '"__proto__":{"x":1},"packId"'));
    expect(() => validateDatapack(p)).not.toThrow(); expect(({} as any).x).toBeUndefined();
  });
});

describe('Datapack · manifesto e versões', () => {
  it('exige esquema, versão de esquema suportada, packId, semver, nome, data e origem', () => {
    expect(codes(withChange(p => { p.manifest.schema = 'x'; }), 'error')).toContain('bad_schema');
    expect(codes(withChange(p => { p.manifest.schemaVersion = 99; }), 'error')).toContain('unsupported_schema_version');
    expect(codes(withChange(p => { p.manifest.packId = 'Pacote Com Espaço'; }), 'error')).toContain('bad_pack_id');
    expect(codes(withChange(p => { p.manifest.version = '1.0'; }), 'error')).toContain('bad_version');
    expect(codes(withChange(p => { p.manifest.name = ''; }), 'error')).toContain('bad_name');
    expect(codes(withChange(p => { p.manifest.createdAt = '2026-02-30'; }), 'error')).toContain('bad_date');
    expect(codes(withChange(p => { p.manifest.origin = 'inventado'; }), 'error')).toContain('bad_origin');
  });
  it('version tem de ser maior que previousVersion', () => {
    expect(codes(withChange(p => { p.manifest.previousVersion = '1.0.0'; }), 'error')).toContain('version_not_increasing');
    expect(validateDatapack(withChange(p => { p.manifest.version = '1.1.0'; p.manifest.previousVersion = '1.0.0'; })).ok).toBe(true);
  });
  it('conferência de contagens do manifesto com o conteúdo real', () => {
    expect(codes(withChange(p => { p.manifest.counts.players = 99; }), 'error')).toContain('count_mismatch');
    expect(codes(withChange(p => { p.players.pop(); }), 'error')).toContain('count_mismatch');
  });
  it('pacote real sem fonte declarada recebe aviso; fonte com url inválida é erro', () => {
    expect(codes(withChange(p => { p.manifest.origin = 'oficial'; }), 'warning')).toContain('no_source');
    expect(codes(withChange(p => { p.manifest.source = { name: 'Fonte', url: 'ftp://x' }; }), 'error')).toContain('bad_source');
    expect(validateDatapack(withChange(p => { p.manifest.origin = 'oficial'; p.manifest.source = { name: 'Fonte', url: 'https://exemplo.org', license: 'x', retrievedAt: '2026-11-01' }; })).ok).toBe(true);
  });
});

describe('Datapack · ids e duplicações', () => {
  it('rejeita ids fora do formato <tipo>:<slug> e de outro tipo', () => {
    for (const bad of ['club:Maiúscula', 'club:com espaço', 'club:', 'plr:abc', 'abc', 'club:-x', 'club:x-']) expect(codes(withChange(p => { p.clubs[0].id = bad; }), 'error')).toContain('bad_id');
  });
  it('rejeita id repetido em cada tipo de registro', () => {
    expect(codes(withChange(p => { p.clubs[1].id = p.clubs[0].id; }), 'error')).toContain('duplicate_id');
    expect(codes(withChange(p => { p.players[1].id = p.players[0].id; }), 'error')).toContain('duplicate_id');
    expect(codes(withChange(p => { p.countries.push({ id: 'ctry:teste-a', name: 'Outro' }); p.manifest.counts.countries = 2; }), 'error')).toContain('duplicate_id');
  });
  it('legacyId único (ponte com os ids atuais do jogo) e apelidos sem colisão', () => {
    expect(codes(withChange(p => { p.clubs[0].legacyId = 'flamengo'; p.clubs[1].legacyId = 'flamengo'; }), 'error')).toContain('duplicate_legacy_id');
    expect(codes(withChange(p => { p.clubs[0].aliases = ['CT']; p.clubs[1].aliases = ['ct']; }), 'error')).toContain('alias_collision');
    expect(codes(withChange(p => { p.clubs[0].aliases = ['Clube Teste 002']; }), 'error')).toContain('alias_collision');
  });
  it('avisa sobre possível clube e jogador duplicados sem bloquear', () => {
    const c = withChange(p => { p.clubs[1].name = p.clubs[0].name; });
    expect(validateDatapack(c).ok).toBe(true); expect(codes(c, 'warning')).toContain('possible_duplicate_club');
    const pl = withChange(p => { for (const x of p.players.slice(0, 2)) { x.name = 'Mesmo Nome'; x.birthDate = '2000-01-01'; x.clubId = 'club:teste-001'; } });
    expect(validateDatapack(pl).ok).toBe(true); expect(codes(pl, 'warning')).toContain('possible_duplicate_player');
  });
  it('jogador transferido mantém o mesmo id (o id não carrega o clube)', () => {
    const p = withChange(x => { x.players[0].clubId = 'club:teste-002'; });
    expect(validateDatapack(p).ok).toBe(true); expect(p.players[0].id).toBe('plr:teste-001-001');
  });
});

describe('Datapack · integridade referencial', () => {
  it('detecta referências para registros que não existem', () => {
    expect(codes(withChange(p => { p.clubs[0].countryId = 'ctry:nao-existe'; }), 'error')).toContain('missing_ref');
    expect(codes(withChange(p => { p.players[0].clubId = 'club:nao-existe'; }), 'error')).toContain('missing_ref');
    expect(codes(withChange(p => { p.players[0].nationalityId = 'ctry:nao-existe'; }), 'error')).toContain('missing_ref');
    expect(codes(withChange(p => { p.competitions[0].countryId = 'ctry:nao-existe'; }), 'error')).toContain('missing_ref');
    expect(codes(withChange(p => { p.editions[0].competitionId = 'comp:nao-existe'; }), 'error')).toContain('missing_ref');
    expect(codes(withChange(p => { p.editions[0].clubIds.push('club:nao-existe'); }), 'error')).toContain('missing_ref');
  });
  it('clube sem país é erro; jogador sem clube (agente livre) é permitido', () => {
    expect(codes(withChange(p => { delete p.clubs[0].countryId; }), 'error')).toContain('bad_id');
    expect(validateDatapack(withChange(p => { delete p.players[0].clubId; })).ok).toBe(true);
  });
  it('competição sem país (internacional) é permitida; edição repetida e clube repetido na edição não', () => {
    expect(validateDatapack(withChange(p => { delete p.competitions[0].countryId; })).ok).toBe(true);
    expect(codes(withChange(p => { p.editions.push({ ...p.editions[0] }); p.manifest.counts.editions = 2; }), 'error')).toContain('duplicate_edition');
    expect(codes(withChange(p => { p.editions[0].clubIds.push(p.editions[0].clubIds[0]); }), 'error')).toContain('duplicate_id');
  });
});

describe('Datapack · valores dos campos', () => {
  it('jogador: posição, overall, potential, idade, nascimento e contrato', () => {
    expect(codes(withChange(p => { p.players[0].position = 'ATA'; }), 'error')).toContain('bad_position');
    for (const v of [0, 100, 50.5, '70', NaN]) expect(codes(withChange(p => { p.players[0].overall = v; }), 'error')).toContain('bad_number');
    expect(codes(withChange(p => { p.players[0].potential = 10; p.players[0].overall = 60; }), 'warning')).toContain('potential_below_overall');
    expect(codes(withChange(p => { p.players[0].age = 5; }), 'error')).toContain('bad_number');
    expect(codes(withChange(p => { p.players[0].birthDate = '2001-13-01'; }), 'error')).toContain('bad_date');
    expect(codes(withChange(p => { delete p.players[0].age; }), 'warning')).toContain('age_missing');
    expect(codes(withChange(p => { p.players[0].contract = { until: 'amanhã' }; }), 'error')).toContain('bad_contract');
    expect(validateDatapack(withChange(p => { p.players[0].contract = { until: '2028-06-30', wage: 1000 }; p.players[0].secondaryPositions = ['CB']; })).ok).toBe(true);
  });
  it('atributos limitados de 1 a 99 e com nomes válidos', () => {
    expect(validateDatapack(withChange(p => { p.players[0].attributes = { pace: 80, shooting: 70 }; })).ok).toBe(true);
    expect(codes(withChange(p => { p.players[0].attributes = { pace: 120 }; }), 'error')).toContain('bad_number');
    expect(codes(withChange(p => { p.players[0].attributes = { 'Nome Ruim': 50 }; }), 'error')).toContain('bad_attributes');
    expect(codes(withChange(p => { p.players[0].attributes = Object.fromEntries(Array.from({ length: LIMITS.maxAttributes + 1 }, (_, i) => [`a${i}`, 50])); }), 'error')).toContain('bad_attributes');
  });
  it('clube: rating 1–100, cores #rrggbb, apelidos e ids externos', () => {
    expect(codes(withChange(p => { p.clubs[0].rating = 101; }), 'error')).toContain('bad_number');
    expect(codes(withChange(p => { p.clubs[0].colors = ['#fff', '#000000']; }), 'error')).toContain('bad_color');
    expect(validateDatapack(withChange(p => { p.clubs[0].colors = ['#112233', '#AABBCC']; p.clubs[0].externalIds = { apiFootball: 127 }; })).ok).toBe(true);
    expect(codes(withChange(p => { p.clubs[0].externalIds = { x: {} }; }), 'error')).toContain('bad_external_ids');
  });
  it('país, competição e edição: código, confederação, tipo, nível e temporada', () => {
    expect(codes(withChange(p => { p.countries[0].code = 'br'; }), 'error')).toContain('bad_code');
    expect(codes(withChange(p => { p.countries[0].confederation = 'XYZ'; }), 'error')).toContain('bad_confederation');
    expect(codes(withChange(p => { p.competitions[0].kind = 'torneio'; }), 'error')).toContain('bad_kind');
    expect(codes(withChange(p => { p.competitions[0].tier = 0; }), 'error')).toContain('bad_number');
    expect(codes(withChange(p => { p.editions[0].season = 'ano passado'; }), 'error')).toContain('bad_season');
    expect(validateDatapack(withChange(p => { p.editions[0].season = '2025/26'; })).ok).toBe(true);
  });
  it('dataStatus usa o mesmo vocabulário do jogo', () => {
    for (const s of ['oficial', 'pesquisa', 'estimativa', 'simulado']) expect(validateDatapack(withChange(p => { p.clubs[0].dataStatus = s; })).ok).toBe(true);
    expect(codes(withChange(p => { p.clubs[0].dataStatus = 'verdadeiro'; }), 'error')).toContain('bad_status');
  });
  it('isIsoDate aceita só datas reais', () => {
    for (const ok of ['2026-02-28', '2024-02-29', '2026-11-08T10:00:00Z', '2026-11-08T10:00:00-03:00']) expect(isIsoDate(ok)).toBe(true);
    for (const bad of ['2026-02-30', '2025-02-29', '2026-13-01', '26-01-01', '', null, 20260101]) expect(isIsoDate(bad)).toBe(false);
  });
});

describe('Datapack · limites e desempenho', () => {
  it('limita a lista de problemas, mas continua contando os erros (resultado continua correto)', () => {
    const p = withChange(x => { x.players = Array.from({ length: 1000 }, () => ({})); x.manifest.counts.players = 1000; });
    const r = validateDatapack(p);
    expect(r.ok).toBe(false); expect(r.issues.length).toBe(LIMITS.maxIssues); expect(r.truncated).toBe(true);
  });
  it('recusa pacotes acima do limite de registros', () => {
    const p = clone(); p.players = new Array(LIMITS.maxRecords + 1).fill(null);
    expect(codes(p, 'error')).toContain('too_large');
  });
  it('valida 20 mil jogadores e 600 clubes em tempo curto', () => {
    const big: Datapack = testPack({ clubs: 600, playersPerClub: 34 });
    const t0 = performance.now(); const r = validateDatapack(big); const ms = performance.now() - t0;
    expect(r.ok).toBe(true); expect(r.stats.players).toBe(20400); expect(ms).toBeLessThan(2000);
  });
  it('pacote grande com apelidos em todos os clubes não explode (verificação linear)', () => {
    const big: any = testPack({ clubs: 3000, playersPerClub: 1 });
    big.clubs.forEach((c: any, i: number) => { c.aliases = [`Apelido ${i}`]; }); big.editions[0].clubIds = big.editions[0].clubIds.slice(0, 100);
    const t0 = performance.now(); const r = validateDatapack(big); const ms = performance.now() - t0;
    expect(r.ok).toBe(true); expect(ms).toBeLessThan(2000);
  });
});
