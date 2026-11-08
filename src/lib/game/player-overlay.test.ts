import { describe, expect, it } from 'vitest';
import { addDays, advanceToMatch, completeRound, createCareer, ensureFields, nextFixture, type CareerV2, type Player } from './career';
import { initializeSeason } from './seasons';
import { buyPlayer, sellPlayer } from './career';
import { analyzeCareerPlayers, compactPlayer, compactSquad, compactVerified, expandPlayer, expandSquad } from './player-overlay';
import { legacyPlayers, toGamePlayer } from './player-provider';

const career = (club = 'flamengo') => initializeSeason(ensureFields(createCareer('Teste', club)));
const played = (c: CareerV2, rounds: number) => { for (let i = 0; i < rounds; i++) { c = advanceToMatch(c); if (!nextFixture(c)) break; c = completeRound(c, 1, 0, undefined, '2026-11-08'); } return c; };
const norm = (p: unknown) => JSON.parse(JSON.stringify(p));

describe('Jogadores na carreira · só o que mudou', () => {
  it('jogador igual à base vira só o id; mudança de contrato, clube e nota vira só a diferença', () => {
    const base = toGamePlayer(legacyPlayers.byClub('santos')[0]!);
    expect(compactPlayer(base, legacyPlayers)).toEqual({ id: base.id });
    const moved: Player = { ...base, clubId: 'bahia', contractUntil: '2029-01-01', wage: base.wage + 5, rating: base.rating + 1 };
    expect(compactPlayer(moved, legacyPlayers)).toEqual({ id: base.id, set: { clubId: 'bahia', contractUntil: '2029-01-01', wage: base.wage + 5, rating: base.rating + 1 } });
  });
  it('ida e volta devolve o jogador idêntico (inclusive campos extras e campos removidos)', () => {
    const base = toGamePlayer(legacyPlayers.byClub('santos')[1]!);
    const cases: Player[] = [base, { ...base, contractUntil: '2028-05-05', academy: true, potential: 80 }, (({ value: _v, ...rest }) => rest as unknown as Player)(base)];
    for (const p of cases) expect(norm(expandPlayer(compactPlayer(p, legacyPlayers), legacyPlayers))).toEqual(norm(p));
  });
  it('jogador sem base (API, agente livre) fica guardado por inteiro e volta igual', () => {
    const api: Player = { id: 'flamengo-api-999', apiId: 999, clubId: 'flamengo', name: 'Nome Qualquer', pos: 'MEI', age: 24, rating: 70, value: 1, wage: 1, real: true };
    const e = compactPlayer(api, legacyPlayers);
    expect(e).toEqual({ id: api.id, full: api }); expect(expandPlayer(e, legacyPlayers)).toEqual(api);
    expect((e as { full: Player }).full).not.toBe(api); // cópia, não a mesma referência
  });
  it('base que sumiu: expandir devolve null e a lista informa o id, sem descartar em silêncio', () => {
    const base = toGamePlayer(legacyPlayers.byClub('santos')[2]!);
    const entries = [compactPlayer(base, legacyPlayers), { id: 'id-que-sumiu' }];
    expect(expandPlayer(entries[1]!, legacyPlayers)).toBeNull();
    const r = expandSquad(entries, legacyPlayers); expect(r.players).toHaveLength(1); expect(r.missing).toEqual(['id-que-sumiu']);
  });
  it('compactação verificada: se a ida e volta não for exata, guarda por inteiro (nunca perde dado)', () => {
    const base = toGamePlayer(legacyPlayers.byClub('santos')[3]!);
    const weird = { ...base, extra: { nested: [1, 2, 3] } } as unknown as Player;
    expect(norm(expandPlayer(compactVerified(weird, legacyPlayers), legacyPlayers))).toEqual(norm(weird));
  });
  it('se a base mudar entre compactar e conferir, o jogador é guardado por inteiro', () => {
    const p = toGamePlayer(legacyPlayers.byClub('santos')[5]!), other = legacyPlayers.byClub('bahia')[0]!;
    let calls = 0;
    const unstable = { ...legacyPlayers, find: (id: string) => (calls++ % 2 === 0 ? legacyPlayers.find(id) : other) };
    expect(compactVerified(p, unstable)).toEqual({ id: p.id, full: p });
  });
  it('não altera o jogador nem a base recebidos', () => {
    const p = toGamePlayer(legacyPlayers.byClub('santos')[4]!), before = structuredClone(p), baseBefore = structuredClone(legacyPlayers.byClub('santos')[4]);
    compactSquad([p], legacyPlayers); expect(p).toEqual(before); expect(legacyPlayers.byClub('santos')[4]).toEqual(baseBefore);
  });
});

describe('Jogadores na carreira · carreiras reais e antigas', () => {
  it('carreira nova e depois de 30 rodadas: tudo reconstruível sem perda, e o save compacto é menor', () => {
    for (const c of [career(), played(career(), 30)]) {
      const r = analyzeCareerPlayers(c, legacyPlayers);
      expect(r.lossless).toBe(true); expect(r.total.withBase + r.total.embedded).toBe(r.total.total);
      expect(r.total.compactBytes).toBeLessThan(r.total.fullBytes);
      expect(r.references.unknown).toEqual([]);
    }
  });
  it('depois de compras e vendas, tudo continua reconstruível e as mudanças aparecem como diferenças', () => {
    let c = played(career(), 5);
    const bought = buyPlayer(c, c.market.find(p => p.clubId !== 'livre')!.id); c = bought.career;
    const sold = sellPlayer(c, c.squad[c.squad.length - 1]!.id, 1_000_000); c = sold.career;
    const r = analyzeCareerPlayers(c, legacyPlayers);
    expect(r.lossless).toBe(true); expect(r.total.changedFields['clubId']).toBeGreaterThan(0);
  });
  it('save antigo (sem contratos, sem campos novos) é reconhecido e reconstruível', () => {
    const raw = JSON.parse(JSON.stringify(createCareer('Antigo', 'flamengo'))) as Record<string, unknown>;
    for (const k of ['finance', 'academy', 'seasonState', 'otherSquads', 'worldClubs', 'negotiations', 'loans', 'transferHistory', 'aiBalances']) delete raw[k];
    raw['squad'] = (raw['squad'] as Record<string, unknown>[]).map(({ contractUntil: _c, ...p }) => p);
    const old = raw as unknown as CareerV2, r = analyzeCareerPlayers(old, legacyPlayers);
    expect(r.groups.squad.total).toBe(22); expect(r.groups.squad.withBase).toBe(22); expect(r.groups.squad.changedFields).toEqual({}); expect(r.lossless).toBe(true);
    const back = expandSquad(compactSquad(old.squad, legacyPlayers), legacyPlayers);
    expect(back.missing).toEqual([]); expect(norm(back.players)).toEqual(norm(old.squad));
  });
  it('referências por id (mercado, negociações, empréstimos, histórico) continuam apontando para jogadores conhecidos', () => {
    const c = played(career(), 8), r = analyzeCareerPlayers(c, legacyPlayers);
    expect(r.references.resolvable).toBe(r.references.total);
  });
  it('referência para jogador desconhecido é apontada, não escondida', () => {
    const c = career(); c.transferHistory = [{ id: 'x', date: c.date, player: 'Ninguém', playerId: 'sumiu-123', from: 'a', to: 'b', kind: 'buy', fee: 0, wage: 0, ai: true }];
    expect(analyzeCareerPlayers(c, legacyPlayers).references.unknown).toEqual(['sumiu-123']);
  });
  it('contratos antigos e novos: datas continuam como estavam', () => {
    const c = career(); const p = c.squad[0]!;
    const back = expandPlayer(compactPlayer(p, legacyPlayers), legacyPlayers)!;
    expect(back.contractUntil).toBe(addDays(c.date, 730)); expect(back.contractUntil).toBe(p.contractUntil);
  });
});
