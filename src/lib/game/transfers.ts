import { CLUBS } from './clubs';
import { addDays, aiSquad, currentWeek, money, seeded, squadFromApi, type CareerV2, type Player } from './career';

export type WorldClub = { id: string; apiId: number; name: string; country: string | null; fetchedAt: string | null };
export type DealTerms = { kind: 'buy' | 'loan'; fee: number; wage: number; months: number };
export type Negotiation = DealTerms & { id: string; playerId: string; fromClub: string; created: string; expires: string; status: 'pending' | 'counter' | 'accepted' | 'rejected' | 'completed' };
export type Loan = { playerId: string; owner: string; borrower: string; until: string; originalWage: number; originalContract?: string | undefined };
export type TransferRecord = { id: string; date: string; player: string; playerId: string; from: string; to: string; kind: 'buy' | 'loan' | 'return' | 'renew' | 'release'; fee: number; wage: number; until?: string | undefined; ai: boolean };

export const marketClubName = (c: CareerV2, id: string) => CLUBS.find(x => x.id === id)?.name ?? c.worldClubs?.find(x => x.id === id)?.name ?? (id === 'livre' ? 'Sem clube' : id);
export const playerIdentity = (p: Player) => p.apiId ? `api:${p.apiId}` : p.id.includes('-api-') ? `api:${p.id.split('-api-')[1]}` : p.id;
const same = (a: Player, b: Player) => playerIdentity(a) === playerIdentity(b);
export const clubSquad = (c: CareerV2, id: string): Player[] => id === c.clubId ? c.squad : c.otherSquads?.[id] ?? (CLUBS.some(x => x.id === id) ? aiSquad(c, id) : []);
function putSquad(c: CareerV2, id: string, squad: Player[]) {
  if (id === c.clubId) c.squad = squad; else { c.otherSquads ??= {}; c.otherSquads[id] = squad; }
}
function budget(c: CareerV2, id: string) {
  if (id === c.clubId) return c.balance;
  c.aiBalances ??= {};
  return c.aiBalances[id] ??= CLUBS.find(x => x.id === id)?.budget ?? 100_000_000; // game budget, never an official club valuation
}
function cash(c: CareerV2, id: string, amount: number) {
  if (id === 'livre') return;
  if (id === c.clubId) {
    c.balance += amount;
    const wk = currentWeek(c);
    if (amount >= 0) wk.income += amount; else wk.expense -= amount;
    wk.items.push({ label: 'Mercado de transferências (simulação)', value: amount });
  } else { c.aiBalances ??= {}; c.aiBalances[id] = budget(c, id) + amount; }
}
function record(c: CareerV2, p: Player, from: string, to: string, kind: TransferRecord['kind'], fee: number, wage: number, until?: string) {
  c.transferHistory ??= [];
  const row: TransferRecord = { id: `tr-${c.date}-${p.id}-${c.transferHistory.length}`, date: c.date, player: p.name, playerId: p.id, from, to, kind, fee, wage, until, ai: from !== c.clubId && to !== c.clubId };
  c.transferHistory.unshift(row);
  c.news.unshift({ id: row.id, date: c.date, kind: 'transfer', title: `${kind === 'loan' ? 'Empréstimo' : kind === 'return' ? 'Retorno' : kind === 'renew' ? 'Renovação' : kind === 'release' ? 'Fim de contrato' : 'Transferência'}: ${p.name}`, body: `${marketClubName(c, from)} → ${marketClubName(c, to)} · ${money(fee)}. Negociação simulada da carreira.` });
}

export function importWorldSquad(c: CareerV2, club: Omit<WorldClub, 'id'>, api: Parameters<typeof squadFromApi>[2]) {
  const next = structuredClone(c);
  const id = CLUBS.find(x => x.apiId === club.apiId)?.id ?? `world-${club.apiId}`;
  if (id === c.clubId) return next; // never replace the manager's squad
  next.worldClubs ??= [];
  next.worldClubs = [...next.worldClubs.filter(x => x.id !== id), { ...club, id }];
  // Once imported, the career's ownership is authoritative. A later API refresh must not undo deals.
  if (next.otherSquads?.[id]) return next;
  const occupied = [...next.squad, ...Object.values(next.otherSquads ?? {}).flat()];
  const players = squadFromApi(id, CLUBS.find(x => x.id === id)?.rating ?? 76, api).filter(p => !occupied.some(x => same(x, p)));
  putSquad(next, id, players.map(p => ({ ...p, contractUntil: addDays(next.date, 730) })));
  next.market = [...next.market, ...players.filter(p => !next.market.some(x => same(x, p)))];
  return next;
}

function validTerms(t: DealTerms) {
  return (t.kind === 'buy' || t.kind === 'loan') && Number.isFinite(t.fee) && t.fee >= 0 && Number.isFinite(t.wage) && t.wage >= 0 && Number.isInteger(t.months) && t.months >= 1 && t.months <= (t.kind === 'loan' ? 12 : 60);
}
export function proposeDeal(c: CareerV2, playerId: string, terms: DealTerms): { career: CareerV2; error?: string } {
  const p = c.market.find(x => x.id === playerId);
  if (!p || p.clubId === c.clubId) return { career: c, error: 'Jogador indisponível.' };
  if (!validTerms(terms)) return { career: c, error: 'Valores ou duração inválidos.' };
  if (c.loans?.some(x => x.playerId === p.id)) return { career: c, error: 'Jogador já está emprestado.' };
  if (c.negotiations?.some(x => x.playerId === p.id && ['pending', 'counter', 'accepted'].includes(x.status))) return { career: c, error: 'Já existe uma negociação aberta.' };
  if (terms.fee > c.balance) return { career: c, error: 'Saldo insuficiente.' };
  const next = structuredClone(c);
  next.negotiations ??= [];
  next.negotiations.unshift({ ...terms, id: `deal-${c.date}-${p.id}-${next.negotiations.length}`, playerId, fromClub: p.clubId, created: c.date, expires: addDays(c.date, 7), status: 'pending' });
  return { career: next };
}

export function transferPlayer(c: CareerV2, playerId: string, from: string, to: string, terms: DealTerms): { career: CareerV2; error?: string } {
  const p = clubSquad(c, from).find(x => x.id === playerId) ?? (from === 'livre' ? c.market.find(x => x.id === playerId && x.clubId === 'livre') : undefined);
  if (!p || from === to) return { career: c, error: 'Jogador indisponível no clube de origem.' };
  if (!validTerms(terms)) return { career: c, error: 'Valores ou duração inválidos.' };
  if (c.loans?.some(x => x.playerId === p.id)) return { career: c, error: 'Não é possível negociar um jogador emprestado.' };
  if (to === 'livre') return { career: c, error: 'Selecione um clube comprador.' };
  if (from !== 'livre' && clubSquad(c, from).length <= 16) return { career: c, error: 'Elenco mínimo de 16 jogadores no clube vendedor.' };
  const reserved = c.loans?.filter(x => x.owner === to).length ?? 0;
  if (clubSquad(c, to).length + reserved >= 32) return { career: c, error: 'Elenco cheio (máximo 32, incluindo vagas de empréstimos).' };
  if (clubSquad(c, to).some(x => same(x, p))) return { career: c, error: 'Jogador já está no clube.' };
  const next = structuredClone(c);
  if (terms.fee > budget(next, to)) return { career: c, error: 'Clube comprador sem saldo suficiente.' };
  if (terms.wage < p.wage) return { career: c, error: 'Jogador recusou o salário oferecido.' };
  if (to !== c.clubId && terms.fee > Math.round(p.value * (terms.kind === 'loan' ? 0.16 : 1.2))) return { career: c, error: 'O clube recusou o valor pedido.' };
  const until = addDays(c.date, terms.months * 30);
  const signed = { ...p, clubId: to, wage: terms.wage, contractUntil: terms.kind === 'buy' ? until : p.contractUntil };
  putSquad(next, from, clubSquad(next, from).filter(x => !same(x, p)));
  putSquad(next, to, [...clubSquad(next, to), signed]);
  cash(next, to, -terms.fee); cash(next, from, terms.fee);
  if (terms.kind === 'loan') {
    next.loans ??= [];
    next.loans.push({ playerId: p.id, owner: from, borrower: to, until, originalWage: p.wage, originalContract: p.contractUntil });
  }
  next.market = next.market.filter(x => !same(x, p));
  next.offers = next.offers.filter(x => x.playerId !== p.id);
  if (to === c.clubId) next.transferredIn = [...new Set([...next.transferredIn, p.id])];
  if (from === c.clubId) next.transferredOut = [...new Set([...next.transferredOut, p.id])];
  record(next, p, from, to, terms.kind, terms.fee, terms.wage, until);
  return { career: next };
}

export function acceptNegotiation(c: CareerV2, id: string) {
  const deal = c.negotiations?.find(x => x.id === id);
  if (!deal || !['accepted', 'counter'].includes(deal.status) || deal.expires < c.date) return { career: c, error: 'Proposta indisponível ou vencida.' };
  const result = transferPlayer(c, deal.playerId, deal.fromClub, c.clubId, deal);
  if (!result.error) result.career.negotiations = (result.career.negotiations ?? []).map(x => x.id === id ? { ...x, status: 'completed' } : x);
  return result;
}

export function renewContract(c: CareerV2, playerId: string, wage: number, months: number) {
  const p = c.squad.find(x => x.id === playerId);
  if (!p || c.loans?.some(x => x.playerId === playerId) || !validTerms({ kind: 'buy', fee: 0, wage, months }) || wage < p.wage) return { career: c, error: 'Renovação inválida: confira salário, duração e vínculo.' };
  const next = structuredClone(c);
  const until = addDays(c.date, months * 30);
  next.squad = next.squad.map(x => x.id === playerId ? { ...x, wage, contractUntil: until } : x);
  record(next, p, c.clubId, c.clubId, 'renew', 0, wage, until);
  return { career: next };
}

/** Runs only when game time advances; never calls the external API. */
export function processMarketDay(c: CareerV2) {
  for (const deal of c.negotiations ?? []) {
    if (deal.expires < c.date && ['pending', 'counter', 'accepted'].includes(deal.status)) { deal.status = 'rejected'; continue; }
    if (deal.status !== 'pending' || deal.created >= c.date) continue;
    const p = c.market.find(x => x.id === deal.playerId && x.clubId === deal.fromClub);
    if (!p) { deal.status = 'rejected'; continue; }
    const ask = Math.round(p.value * (deal.kind === 'loan' ? 0.12 : 1.1));
    if (deal.fee >= ask && deal.wage >= p.wage) deal.status = 'accepted';
    else if (deal.fee >= ask * 0.65) { deal.status = 'counter'; deal.fee = ask; deal.wage = Math.max(p.wage, deal.wage); }
    else deal.status = 'rejected';
  }
  for (const loan of [...c.loans ?? []]) {
    if (loan.until > c.date) continue;
    const p = clubSquad(c, loan.borrower).find(x => x.id === loan.playerId);
    if (!p) continue;
    // The owner may not fill this reserved roster slot while the loan is active.
    putSquad(c, loan.borrower, clubSquad(c, loan.borrower).filter(x => x.id !== p.id));
    putSquad(c, loan.owner, [...clubSquad(c, loan.owner), { ...p, clubId: loan.owner, wage: loan.originalWage, contractUntil: loan.originalContract }]);
    c.loans = (c.loans ?? []).filter(x => x !== loan);
    c.transferredIn = c.transferredIn.filter(x => x !== p.id); c.transferredOut = c.transferredOut.filter(x => x !== p.id);
    record(c, p, loan.borrower, loan.owner, 'return', 0, loan.originalWage);
  }
  for (const id of [c.clubId, ...Object.keys(c.otherSquads ?? {})]) {
    for (const p of [...clubSquad(c, id)]) {
      if (!p.contractUntil || p.contractUntil >= c.date || c.loans?.some(x => x.playerId === p.id)) continue;
      if (id !== c.clubId || clubSquad(c, id).length <= 16) {
        putSquad(c, id, clubSquad(c, id).map(x => x.id === p.id ? { ...x, contractUntil: addDays(c.date, 365) } : x));
        record(c, p, id, id, 'renew', 0, p.wage, addDays(c.date, 365));
      } else {
        putSquad(c, id, clubSquad(c, id).filter(x => x.id !== p.id));
        c.market.push({ ...p, clubId: 'livre', value: 0 }); record(c, p, id, 'livre', 'release', 0, p.wage);
      }
    }
  }
  const r = seeded(`ai-market:${c.date}`);
  if (r() > 0.35) return;
  const ids = [...new Set([...CLUBS.map(x => x.id), ...Object.keys(c.otherSquads ?? {})])].filter(x => x !== c.clubId);
  const from = ids[Math.floor(r() * ids.length)], to = ids[Math.floor(r() * ids.length)];
  if (!from || !to || from === to) return;
  const available = clubSquad(c, from).filter(p => !c.loans?.some(x => x.playerId === p.id));
  const p = available[Math.floor(r() * available.length)];
  if (!p) return;
  const kind = r() < 0.25 ? 'loan' : 'buy';
  const result = transferPlayer(c, p.id, from, to, { kind, fee: Math.round(p.value * (kind === 'loan' ? 0.12 : 1)), wage: p.wage, months: kind === 'loan' ? 6 : 24 });
  if (!result.error) Object.assign(c, result.career);
}