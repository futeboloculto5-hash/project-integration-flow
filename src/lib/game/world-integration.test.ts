// Etapa 7 · fase 3: os sistemas do jogo funcionando com jogadores IMPORTADOS (pacote sintético de testes).
// Prova que carreira, motor, mercado, compra/venda, empréstimo, contrato, evolução, histórico e save aceitam jogadores de datapack,
// e que, sem pacote ativo, tudo é idêntico ao jogo atual.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { advanceToMatch, aiSquad, bestEleven, buyPlayer, completeRound, createCareer, ensureFields, nextFixture, refreshMarket, sellPlayer, teamRating, type CareerV2 } from './career';
import { initializeSeason, recordFixture, simulateDue, startNextSeason } from './seasons';
import { proposeDeal, renewContract, transferPlayer, processMarketDay, acceptNegotiation, clubSquad } from './transfers';
import { decodeCareer, decodeCareerWithReport, encodeCareer, isEncoded, CodecError, type EncodedCareer } from './career-codec';
import { createPackStore, createWorldPlayerProvider, importDatapackForGame } from './datapack-bridge';
import { resetPlayerProvider, usePlayerProvider, activePlayers } from './player-source';
import { legacyPlayers } from './player-provider';
import { syntheticSquadPack } from '@/lib/datapack/fixtures';
import { legacyClubs } from './club-provider';

const ASOF = '2026-11-10', DAY = '2026-11-08';
const CLUBS = ['flamengo', 'palmeiras', 'sport'];
const json = (o: unknown) => JSON.parse(JSON.stringify(o));
const files = (p: unknown) => [{ name: 'datapack.json', text: JSON.stringify(p) }];
const career = (club = 'flamengo') => initializeSeason(ensureFields(createCareer('Técnico', club)));
const played = (c: CareerV2, rounds: number) => { for (let i = 0; i < rounds; i++) { c = advanceToMatch(c); if (!nextFixture(c)) break; c = completeRound(c, 1 + (i % 3), i % 2, undefined, DAY); } return c; };

function install(version = '1.0.0', bump = 0) {
  const store = createPackStore();
  const r = importDatapackForGame(store, files(syntheticSquadPack({ clubs: CLUBS, version, bump })));
  expect(r.report.errors).toBe(0);
  const world = createWorldPlayerProvider(store, { asOf: ASOF });
  usePlayerProvider(world);
  return { store, world };
}
beforeEach(() => resetPlayerProvider());
afterEach(() => resetPlayerProvider());

describe('Integração · regressão: sem pacote ativo nada muda', () => {
  it('a fonte ativa por padrão são os jogadores atuais', () => {
    expect(activePlayers()).toBe(legacyPlayers);
  });
  it('ativar e desativar um mundo deixa as carreiras novas idênticas às de antes', () => {
    const before = json(career());
    install();
    resetPlayerProvider();
    expect(json(career())).toEqual(before);
  });
  it('o pacote cobre só 3 clubes: os demais seguem com os jogadores atuais (ids e dados iguais)', () => {
    const before = json(aiSquad(career(), 'bahia'));
    install();
    const c = career();
    expect(json(aiSquad(c, 'bahia'))).toEqual(before);
    expect(aiSquad(c, 'palmeiras')[0]!.id.startsWith('plr:sint-palmeiras')).toBe(true);
  });
});

describe('Integração · carreira nova com jogadores importados', () => {
  it('elenco do técnico e dos clubes cobertos vêm do pacote, sem ids repetidos no mundo', () => {
    install();
    const c = career('flamengo');
    expect(c.squad).toHaveLength(26);
    expect(c.squad.every((p) => p.id.startsWith('plr:sint-flamengo') && p.clubId === 'flamengo')).toBe(true);
    const all = [c.squad, ...legacyClubs.list().filter((x) => x.id !== 'flamengo').map((x) => aiSquad(c, x.id))].flat();
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    expect(teamRating(c.squad)).toBeGreaterThan(55);
    expect(bestEleven(c.squad)).toHaveLength(11);
  });
  it('um clube que não está no pacote continua jogável como técnico', () => {
    install();
    const c = career('bahia');
    expect(c.squad.length).toBeGreaterThanOrEqual(16);
    expect(c.squad.some((p) => p.id.startsWith('plr:'))).toBe(false);
  });
  it('a carreira é determinística: duas carreiras iguais dão o mesmo resultado', () => {
    install();
    expect(json(played(career(), 8))).toEqual(json(played(career(), 8)));
  });
});

describe('Integração · motor de partidas, evolução e temporada', () => {
  it('joga uma rodada após a outra sem erro e os jogadores do pacote entram na partida e na tabela', () => {
    install();
    let c = career();
    c = played(c, 12);
    expect(c.fixtures.filter((f) => f.hg != null).length).toBeGreaterThan(5);
    expect(c.squad.every((p) => p.id.startsWith('plr:sint-flamengo'))).toBe(true);
  });
  it('fecha a temporada e começa a seguinte: ids estáveis, ninguém duplicado, ninguém some', () => {
    install();
    let c = career();
    const before = new Set(c.squad.map((p) => p.id));
    for (const f of c.fixtures) recordFixture(c, f, f.home === c.clubId ? 2 : 0, f.away === c.clubId ? 2 : 0);
    for (let i = 0; i < 4; i++) { for (const f of c.seasonState?.cup ?? []) recordFixture(c, f, 1, 1); simulateDue(c, '2026-12-31'); }
    const r = startNextSeason(c, DAY);
    expect(r.error).toBeUndefined();
    const next = r.career;
    expect(next.season).not.toBe(c.season);
    const ids = next.squad.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of before) expect(ids.includes(id) || next.market.some((p) => p.id === id) || Object.values(next.otherSquads ?? {}).some((s) => s.some((p) => p.id === id)) || (next.transferredOut ?? []).includes(id)).toBe(true);
    // evolução: a idade avança e o id continua o mesmo
    const a = c.squad[0]!, b = next.squad.find((p) => p.id === a.id);
    if (b) expect(b.age).toBe(a.age + 1);
  });
});

describe('Integração · mercado, compra e venda, empréstimo e contrato', () => {
  it('agentes livres do pacote aparecem no mercado e podem ser contratados (de graça, com o mesmo id)', () => {
    install();
    let c = career();
    c = { ...c, market: refreshMarket(c, '2026-11-09') };
    const free = c.market.filter((p) => p.clubId === 'livre' && p.id.startsWith('plr:sint-livre'));
    expect(free.length).toBeGreaterThan(0);
    const r = buyPlayer(c, free[0]!.id);
    expect(r.error).toBeUndefined();
    expect(r.career.squad.some((p) => p.id === free[0]!.id && p.clubId === c.clubId)).toBe(true);
    expect(r.career.transferredIn).toContain(free[0]!.id);
    expect(r.career.transferHistory?.some((t) => t.playerId === free[0]!.id)).toBe(true);
  });
  it('compra de jogador do pacote em outro clube e venda de um do elenco, com histórico pelo id estável', () => {
    install();
    let c = career();
    const target = aiSquad(c, 'palmeiras').find((p) => p.pos === 'ATA')!;
    c = { ...c, market: [...c.market, target] };
    const bought = buyPlayer(c, target.id);
    expect(bought.error).toBeUndefined();
    expect(clubSquad(bought.career, 'palmeiras').some((p) => p.id === target.id)).toBe(false); // saiu do vendedor
    expect(bought.career.squad.some((p) => p.id === target.id)).toBe(true); // mesmo id no comprador
    const mine = bought.career.squad.filter((p) => p.id !== target.id).sort((a, b) => a.rating - b.rating)[0]!;
    const sold = sellPlayer(bought.career, mine.id, Math.round(mine.value * 0.5));
    expect(sold.error).toBeUndefined();
    expect(sold.career.squad.some((p) => p.id === mine.id)).toBe(false);
    expect(sold.career.transferredOut).toContain(mine.id);
    const hist = sold.career.transferHistory ?? [];
    expect(hist.filter((t) => t.playerId === target.id || t.playerId === mine.id)).toHaveLength(2);
  });
  it('empréstimo: o jogador volta para o dono com o mesmo id e o salário original', () => {
    install();
    let c = career();
    const p = aiSquad(c, 'sport').find((x) => x.pos === 'MEI')!;
    c = { ...c, market: [...c.market, p] };
    const prop = proposeDeal(c, p.id, { kind: 'loan', fee: Math.round(p.value * 0.2), wage: p.wage + 1000, months: 3 });
    expect(prop.error).toBeUndefined();
    c = prop.career;
    c.negotiations![0]!.status = 'accepted';
    const done = acceptNegotiation(c, c.negotiations![0]!.id);
    expect(done.error).toBeUndefined();
    expect(done.career.loans?.[0]?.playerId).toBe(p.id);
    const back = json(done.career) as CareerV2;
    back.date = '2030-01-01';
    processMarketDay(back);
    expect(back.loans ?? []).toHaveLength(0);
    expect(clubSquad(back, 'sport').some((x) => x.id === p.id)).toBe(true);
    expect(back.squad.some((x) => x.id === p.id)).toBe(false);
  });
  it('renovação de contrato mantém o jogador e registra no histórico', () => {
    install();
    const c = career();
    const p = c.squad[0]!;
    const r = renewContract(c, p.id, p.wage + 5000, 24);
    expect(r.error).toBeUndefined();
    expect(r.career.squad.find((x) => x.id === p.id)!.wage).toBe(p.wage + 5000);
    expect(r.career.transferHistory?.[0]).toMatchObject({ playerId: p.id, kind: 'renew' });
  });
  it('transferência entre clubes do pacote pela IA não duplica nem perde jogadores durante meses de jogo', () => {
    install();
    let c = played(career(), 25);
    const ids = [c.squad, ...Object.values(c.otherSquads ?? {})].flat().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Integração · save com jogadores importados', () => {
  it('compacta e reabre sem perda depois de jogar, comprar e vender', () => {
    const { world } = install();
    let c = played(career(), 10);
    const free = refreshMarket(c, '2026-11-09').find((p) => p.clubId === 'livre')!;
    c = { ...c, market: [...c.market, free] };
    c = buyPlayer(c, free.id).career;
    const e = encodeCareer(c, world);
    expect(isEncoded(e)).toBe(true);
    expect(json(decodeCareer(json(e), world))).toEqual(json(c));
  });
  it('save clássico antigo (jogadores atuais) continua abrindo mesmo com um mundo ativo; o save compactado do jogo atual é recusado com segurança', () => {
    const old = played(career(), 5); // gerado SEM pacote
    const encodedLegacy = json(encodeCareer(old, legacyPlayers)); // compactado com a base atual
    expect(json(decodeCareer(json(old)))).toEqual(json(old));
    install();
    let code = '';
    try { decodeCareer(encodedLegacy); } catch (e) { code = e instanceof CodecError ? e.code : 'outro'; }
    expect(code).toBe('base_changed'); // nunca troca jogadores em silêncio
    // com opt-in, reabre; a carreira volta inteira
    const back = decodeCareerWithReport(encodedLegacy, activePlayers(), { rebase: true });
    expect(back.report.rebased).toBe(true);
    expect(back.career.squad).toEqual(old.squad);
  });
  it('atualização do pacote: evolução da carreira é preservada e quem saiu continua resolvendo', () => {
    const { store, world } = install('1.0.0');
    let c = played(career(), 6);
    // evolução feita na carreira num jogador da IA do Palmeiras
    const sq = [...(c.otherSquads?.['palmeiras'] ?? aiSquad(c, 'palmeiras'))];
    c.otherSquads = { ...(c.otherSquads ?? {}), palmeiras: sq.map((p, i) => (i === 0 ? { ...p, rating: p.rating + 4 } : p)) };
    const evolvedId = sq[0]!.id, untouchedId = sq[1]!.id;
    const saved = json(encodeCareer(c, world)) as EncodedCareer;
    // versão 1.1.0: atributos de todos mudam (+2) e o último jogador do Palmeiras sai do pacote
    const v2 = syntheticSquadPack({ clubs: CLUBS, version: '1.1.0', bump: 2 });
    const gone = v2.players.filter((p) => p.clubId === 'club:sint-palmeiras').pop()!;
    v2.players = v2.players.filter((p) => p.id !== gone.id); v2.manifest.counts.players--;
    const r = importDatapackForGame(store, files(v2));
    expect(r.status).toBe('update');
    const world2 = createWorldPlayerProvider(store, { asOf: ASOF });
    usePlayerProvider(world2);
    expect(() => decodeCareer(saved, world2)).toThrow(CodecError); // padrão: recusa
    const { career: back, report } = decodeCareerWithReport(saved, world2, { rebase: true });
    expect(report.rebased).toBe(true);
    const find = (id: string) => Object.values(back.otherSquads ?? {}).flat().find((p) => p.id === id)!;
    expect(find(evolvedId).rating).toBe(sq[0]!.rating + 4); // a evolução da carreira manda
    expect(find(untouchedId).rating).toBe(sq[1]!.rating + 2); // onde a carreira não mexeu, vale a base nova
    expect(world2.has(gone.id)).toBe(true); // quem saiu do pacote continua resolvendo
    expect(Object.values(back.otherSquads ?? {}).flat().some((p) => p.id === gone.id)).toBe(true); // e continua no elenco da carreira
    expect(back.squad).toEqual(c.squad); // o elenco do técnico nunca é tocado
  });
});
