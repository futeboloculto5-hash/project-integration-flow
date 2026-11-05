import { describe, expect, it } from 'vitest';
import { addDays, advanceDay, advanceToMatch, completeRound, createCareer, ensureFields, nextFixture, type CareerV2 } from './career';

/**
 * Rede de proteção das carreiras salvas.
 * Simula um save feito ANTES das funcionalidades de temporada, finanças detalhadas, mercado
 * persistente e categorias de base, e garante que abri-lo e jogar com ele nunca apaga nada.
 * Se uma mudança futura quebrar um destes testes, ela pode corromper carreiras existentes.
 */
const NEWER_FIELDS = ['finance', 'academy', 'seasonState', 'otherSquads', 'worldClubs', 'negotiations', 'loans', 'transferHistory', 'aiBalances'];

function oldSave(): CareerV2 {
  const raw = JSON.parse(JSON.stringify(createCareer('Antigo', 'flamengo'))) as Record<string, unknown>;
  for (const key of NEWER_FIELDS) delete raw[key];
  raw['squad'] = (raw['squad'] as Record<string, unknown>[]).map(({ contractUntil: _contract, ...player }) => player);
  raw['debt'] = 123_456_789;
  raw['balance'] = 42_424_242;
  const fixtures = raw['fixtures'] as { hg?: number; ag?: number }[];
  Object.assign(fixtures[0] ?? {}, { hg: 2, ag: 0 });
  Object.assign(fixtures[1] ?? {}, { hg: 1, ag: 1 });
  return raw as unknown as CareerV2;
}

const withoutContracts = (c: CareerV2) => c.squad.map(({ contractUntil: _contract, ...player }) => player);

describe('Saves antigos continuam abrindo e jogando', () => {
  it('abre sem perder nada do que o técnico já tinha', () => {
    const old = oldSave(), opened = ensureFields(structuredClone(old));
    expect(opened.manager).toBe(old.manager); expect(opened.clubId).toBe(old.clubId);
    expect(opened.season).toBe(old.season); expect(opened.date).toBe(old.date);
    expect(opened.balance).toBe(42_424_242); expect(opened.debt).toBe(123_456_789);
    expect(opened.formation).toBe(old.formation);
    expect(withoutContracts(opened)).toEqual(withoutContracts(old));
    expect(opened.fixtures.slice(0, old.fixtures.length)).toEqual(old.fixtures);
    expect(opened.fixtures[0]).toMatchObject({ hg: 2, ag: 0 }); expect(opened.fixtures[1]).toMatchObject({ hg: 1, ag: 1 });
    expect(opened.news).toEqual(old.news); expect(opened.ledger).toEqual(old.ledger);
    expect(opened.sponsors.map(s => [s.company, s.slot, s.weekly, s.until])).toEqual(old.sponsors.map(s => [s.company, s.slot, s.weekly, s.until]));
  });

  it('acrescenta os campos novos sem apagar os antigos', () => {
    const old = oldSave(), opened = ensureFields(structuredClone(old));
    expect(opened.seasonState).toBeDefined(); expect(opened.finance).toBeDefined(); expect(opened.academy).toBeDefined();
    expect(opened.negotiations).toEqual([]); expect(opened.loans).toEqual([]); expect(opened.transferHistory).toEqual([]);
    expect(opened.squad.every(p => p.contractUntil === addDays(old.date, 730))).toBe(true);
    // A dívida antiga vira contrato parcelado com o mesmo saldo: nada é zerado nem inventado.
    expect(opened.finance?.debts.reduce((sum, d) => sum + d.balance, 0)).toBe(123_456_789);
  });

  it('é idempotente: abrir de novo ou passar por JSON não muda nada', () => {
    const once = ensureFields(structuredClone(oldSave()));
    expect(ensureFields(structuredClone(once))).toEqual(once);
    expect(ensureFields(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it('preserva campos desconhecidos de versões futuras', () => {
    const save = oldSave() as CareerV2 & { campoFuturo?: unknown };
    save.campoFuturo = { qualquer: 'coisa' };
    expect((ensureFields(structuredClone(save)) as typeof save).campoFuturo).toEqual({ qualquer: 'coisa' });
  });

  it('joga normalmente: elenco, resultados e clube se mantêm e a dívida só cai por parcelas', () => {
    const start = ensureFields(structuredClone(oldSave()));
    let cur = start;
    for (let i = 0; i < 40 && cur.date < '2025-04-05'; i++) {
      const step = advanceDay(cur);
      cur = step.blocked ? completeRound(cur, 1, 0) : step.career;
    }
    expect(cur.date >= '2025-04-05').toBe(true);
    expect(cur.clubId).toBe('flamengo'); expect(cur.manager).toBe('Antigo');
    expect(cur.squad.map(p => p.id)).toEqual(start.squad.map(p => p.id));
    expect(cur.fixtures[0]).toMatchObject({ hg: 2, ag: 0 }); expect(cur.fixtures[1]).toMatchObject({ hg: 1, ag: 1 });
    expect(Number.isFinite(cur.balance)).toBe(true);
    expect(cur.debt).toBeLessThan(123_456_789); expect(cur.debt).toBeGreaterThan(0);
    expect(cur.finance?.debts.reduce((sum, d) => sum + d.balance, 0)).toBe(cur.debt);
  });
});

describe('Contrato de não-mutação (o React depende dele)', () => {
  const fresh = () => ensureFields(createCareer('Contrato', 'palmeiras'));
  it('advanceDay não altera a carreira recebida', () => {
    const c = fresh(), before = JSON.stringify(c), result = advanceDay(c).career;
    expect(result).not.toBe(c); expect(JSON.stringify(c)).toBe(before);
  });
  it('advanceToMatch não altera a carreira recebida', () => {
    const c = fresh(), before = JSON.stringify(c), result = advanceToMatch(c);
    expect(JSON.stringify(c)).toBe(before); expect(result.date >= (nextFixture(c)?.date ?? '')).toBe(true);
  });
  it('completeRound não altera a carreira recebida', () => {
    const c = advanceToMatch(fresh()), before = JSON.stringify(c), result = completeRound(c, 2, 1);
    expect(result).not.toBe(c); expect(JSON.stringify(c)).toBe(before);
  });
});
