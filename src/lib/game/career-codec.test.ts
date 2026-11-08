import { describe, expect, it } from 'vitest';
import { advanceToMatch, completeRound, createCareer, ensureFields, nextFixture, buyPlayer, sellPlayer, type CareerV2, type Player } from './career';
import { initializeSeason, recordFixture, simulateDue, startNextSeason } from './seasons';
import { importWorldSquad, proposeDeal, transferPlayer, renewContract } from './transfers';
import { CodecError, SAVE_FORMAT_COMPACT, baseFingerprint, decodeCareer, encodeCareer, isEncoded, type EncodedCareer } from './career-codec';
import { legacyPlayers, createPlayerProvider } from './player-provider';

const career = (club = 'flamengo') => initializeSeason(ensureFields(createCareer('Teste', club)));
const played = (c: CareerV2, rounds: number) => { for (let i = 0; i < rounds; i++) { c = advanceToMatch(c); if (!nextFixture(c)) break; c = completeRound(c, 1, 0, undefined, '2026-11-08'); } return c; };
const json = (o: unknown) => JSON.parse(JSON.stringify(o));
const roundTrip = (c: CareerV2) => json(decodeCareer(json(encodeCareer(c)))); // passa pelo JSON como no banco
const enc = (c: CareerV2) => encodeCareer(c) as EncodedCareer;

describe('Codec do save · compactar e reabrir sem perda', () => {
  it('carreira nova: formato 2, mesmo conteúdo ao reabrir, e fica menor', () => {
    const c = career(), e = enc(c);
    expect(isEncoded(e)).toBe(true); expect(e.saveFormat).toBe(SAVE_FORMAT_COMPACT); expect('otherSquads' in e).toBe(false);
    expect(roundTrip(c)).toEqual(json(c));
    expect(JSON.stringify(e).length).toBeLessThan(JSON.stringify(c).length * 0.8);
  });
  it('depois de 30 rodadas, compras e vendas: tudo idêntico ao reabrir', () => {
    let c = played(career(), 30);
    c = buyPlayer(c, c.market.find(p => p.clubId !== 'livre')!.id).career;
    c = sellPlayer(c, c.squad[c.squad.length - 1]!.id, 1_000_000).career;
    expect(roundTrip(c)).toEqual(json(c));
  });
  it('contratos, salários e renovações são preservados', () => {
    let c = played(career(), 3); const p = c.squad[0]!;
    const r = renewContract(c, p.id, p.wage + 1000, 18); c = r.career ?? c;
    const back = roundTrip(c) as CareerV2;
    expect(back.squad).toEqual(json(c.squad)); expect(back.otherSquads).toEqual(json(c.otherSquads));
  });
  it('empréstimos, negociações, propostas e histórico de transferências (referências por id) são preservados', () => {
    let c = played(career(), 6);
    const target = c.market.find(p => p.clubId !== 'livre' && p.clubId !== c.clubId)!;
    const r = proposeDeal(c, target.id, { kind: 'loan', fee: 1, wage: target.wage + 1, months: 6 }); c = r.career;
    c = played(c, 12);
    const back = roundTrip(c) as CareerV2;
    for (const k of ['loans', 'negotiations', 'offers', 'transferHistory', 'market', 'news', 'transferredIn', 'transferredOut'] as const) expect(back[k]).toEqual(json(c[k]));
    expect(back).toEqual(json(c));
  });
  it('jogador da API-Football e jogador criado na carreira ficam por inteiro e voltam iguais', () => {
    let c = career('flamengo');
    const api = [{ id: 111, name: 'Atleta Teste API', position: 'Midfielder', age: 27 }, ...Array.from({ length: 20 }, (_, i) => ({ id: 200 + i, name: `Atleta Teste ${i}`, position: 'Defender', age: 25 }))];
    c = importWorldSquad(c, { apiId: 99999, name: 'Clube Mundial Teste', country: 'Teste', fetchedAt: '2026-11-08' }, api);
    const created: Player = { id: 'criado-na-carreira-1', clubId: 'bahia', name: 'Criado Teste', pos: 'ATA', age: 19, rating: 60, value: 1, wage: 1, academy: true, potential: 80 };
    c.otherSquads!['bahia'] = [...c.otherSquads!['bahia']!, created];
    const e = enc(c);
    expect(e.playerStore.otherSquads['bahia']!.some(x => 'full' in x && x.id === created.id)).toBe(true);
    expect(e.playerStore.otherSquads['world-99999']!.every(x => 'full' in x)).toBe(true);
    expect(roundTrip(c)).toEqual(json(c));
  });
  it('agentes livres e jogadores que trocaram de clube continuam com o mesmo id', () => {
    const c = played(career(), 4); const p = c.squad[0]!;
    const r = transferPlayer(c, p.id, 'flamengo', 'bahia', { kind: 'buy', fee: Math.min(1_000_000, p.value), wage: p.wage, months: 24 });
    expect(r.error).toBeUndefined();
    const back = roundTrip(r.career) as CareerV2;
    expect(back.otherSquads!['bahia']!.find(x => x.id === p.id)?.clubId).toBe('bahia');
    expect(enc(r.career).playerStore.otherSquads['bahia']!.find(x => x.id === p.id)).toMatchObject({ id: p.id, set: { clubId: 'bahia' } });
    expect(back.market.filter(m => m.clubId === 'livre').map(m => m.id)).toEqual(r.career.market.filter(m => m.clubId === 'livre').map(m => m.id));
  });
  it('a carreira original não é alterada pelo codec', () => {
    const c = played(career(), 5), before = structuredClone(c);
    const e = encodeCareer(c); decodeCareer(e);
    expect(c).toEqual(before); expect(c.otherSquads).toBeDefined();
  });
  it('finanças e dívidas: nada muda (caixa, dívida, extrato, patrocínios, estádio)', () => {
    const c = played(career('corinthians'), 10), back = roundTrip(c) as CareerV2;
    for (const k of ['balance', 'debt', 'finance', 'ledger', 'sponsors', 'sponsorOffers', 'stadium', 'aiBalances'] as const) expect(back[k]).toEqual(json(c[k]));
  });
  it('temporada seguinte: reabre idêntico depois de virar a temporada', () => {
    const c = career('sport');
    for (const f of c.fixtures) recordFixture(c, f, f.home === c.clubId ? 1 : 0, f.away === c.clubId ? 1 : 0);
    for (let i = 0; i < 4; i++) { for (const f of c.seasonState?.cup ?? []) recordFixture(c, f, 1, 1); simulateDue(c, '2026-12-31'); }
    const next = startNextSeason(c, '2026-11-08').career;
    expect(roundTrip(next)).toEqual(json(next));
  });
});

describe('Codec do save · versão, idempotência e saves antigos', () => {
  it('migração repetida não muda nada: codificar o codificado devolve o mesmo; decodificar e codificar de novo dá o mesmo save', () => {
    const c = played(career(), 8), e1 = enc(c);
    expect(encodeCareer(e1)).toBe(e1);
    const e2 = encodeCareer(decodeCareer(json(e1)));
    expect(json(e2)).toEqual(json(e1));
    const e3 = encodeCareer(decodeCareer(json(e2)));
    expect(json(e3)).toEqual(json(e1));
  });
  it('save clássico (como os de hoje) abre exatamente como está, e é o mesmo objeto', () => {
    const c = played(career(), 3);
    expect(decodeCareer(c)).toBe(c);
  });
  it('save antigo, anterior a temporadas e finanças, continua abrindo e é aceito pelo codec', () => {
    const raw = JSON.parse(JSON.stringify(createCareer('Antigo', 'flamengo'))) as Record<string, unknown>;
    for (const k of ['finance', 'academy', 'seasonState', 'otherSquads', 'worldClubs', 'negotiations', 'loans', 'transferHistory', 'aiBalances']) delete raw[k];
    const old = raw as unknown as CareerV2;
    expect(encodeCareer(old)).toBe(old); expect(decodeCareer(old)).toBe(old); // sem elencos de outros clubes: nada a compactar
    const opened = ensureFields(structuredClone(old));
    expect(roundTrip(opened)).toEqual(json(opened));
  });
  it('sem nada a compactar (otherSquads vazio) mantém o formato clássico', () => {
    const c = career(); c.otherSquads = {};
    expect(encodeCareer(c)).toBe(c);
  });
  it('formato desconhecido (futuro) é recusado sem tocar nos dados', () => {
    const e = { ...enc(career()), saveFormat: 9 } as unknown as CareerV2;
    expect(() => decodeCareer(e)).toThrow(CodecError);
    try { decodeCareer(e); } catch (x) { expect((x as CodecError).code).toBe('unsupported_format'); }
  });
  it('store incompleto ou corrompido é recusado com erro claro', () => {
    const e = json(enc(career()));
    const broken = { ...e, playerStore: undefined }; expect(() => decodeCareer(broken)).toThrow('incompletos');
    const bad = json(e); bad.playerStore.otherSquads['bahia'] = 'lixo'; expect(() => decodeCareer(bad)).toThrow(CodecError);
  });
  it('base alterada desde a gravação: recusa abrir (nunca troca jogadores em silêncio)', () => {
    const e = json(enc(career()));
    const changed = createPlayerProvider('outra-base', legacyPlayers.list().map((p, i) => (i === 0 ? { ...p, rating: p.rating + 1 } : p)));
    expect(baseFingerprint(changed)).not.toBe(baseFingerprint(legacyPlayers));
    expect(() => decodeCareer(e, changed)).toThrow('base de jogadores mudou');
  });
  it('jogador-base ausente é detectado', () => {
    const e = json(enc(career()));
    const without = createPlayerProvider('sem-um', legacyPlayers.list().slice(1));
    const forced = { ...e, playerStore: { ...e.playerStore, baseFingerprint: baseFingerprint(without) } };
    expect(() => decodeCareer(forced, without)).toThrow('Jogador-base não encontrado');
  });
  it('a assinatura da base atual está FIXA: se a fórmula ou os nomes mudarem, este teste avisa antes de corromper saves', () => {
    expect(baseFingerprint(legacyPlayers)).toBe(EXPECTED_FINGERPRINT);
  });
});

const EXPECTED_FINGERPRINT = '2e6270daa6a3c5d7'; // gerada da base atual (elencos da fórmula do jogo)
