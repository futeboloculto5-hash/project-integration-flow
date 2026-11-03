import { CLUBS, KIT_BRANDS, clubById } from "./clubs";
import { processMarketDay, transferPlayer, type WorldClub, type Negotiation, type Loan, type TransferRecord } from './transfers';
import { amortize, book, createFinance, finance, ledgerWeek, processFinanceDay, type FinanceState } from './finance';
import { SECTOR_WEIGHTS_2025, SPONSOR_COMPANIES, SPONSOR_MAP_2025, startingDebt, type DataStatus } from './finance-data';
import { allFixtures, initializeSeason, leagueFixtures, progressCup, recordFixture, simulateDue, type Goal, type SeasonState } from './seasons';

export type Pos = "GOL" | "DEF" | "MEI" | "ATA";
export type Player = { id: string; name: string; pos: Pos; age: number; rating: number; value: number; wage: number; clubId: string; real?: boolean; apiId?: number; contractUntil?: string | undefined; ageUnknown?: boolean };
export type Fixture = { round: number; date: string; home: string; away: string; hg?: number; ag?: number; id?: string; division?: string; competition?: 'league' | 'cup'; scheduleSource?: 'simulated' | 'API-Football'; resultSource?: 'simulated'; goals?: Goal[]; penalties?: [number, number]; winner?: string };
export type NewsItem = { id: string; date: string; title: string; body: string; kind: "info" | "offer" | "transfer" | "result" };
export type Offer = { id: string; playerId: string; fromClub: string; fee: number; expires: string };

export type CareerV2 = {
  version: 2;
  manager: string;
  clubId: string;
  season: string;
  date: string; // ISO yyyy-mm-dd
  balance: number;
  squad: Player[];
  fixtures: Fixture[];
  market: Player[];
  offers: Offer[];
  news: NewsItem[];
  transferredIn: string[];
  transferredOut: string[];
  formation: "4-3-3" | "4-4-2" | "3-5-2" | "5-3-2";
  debt: number;
  stadium: { capacity: number; ticketPrice: number; level: number; building?: { until: string; seats: number } };
  sponsors: Sponsor[];
  sponsorOffers: SponsorOffer[];
  otherSquads?: Record<string, Player[]>;
  worldClubs?: WorldClub[];
  negotiations?: Negotiation[];
  loans?: Loan[];
  transferHistory?: TransferRecord[];
  aiBalances?: Record<string, number>;
  seasonState?: SeasonState;
  finance?: FinanceState;
  ledger: { week: string; income: number; expense: number; items: { label: string; value: number }[] }[];
};

export type SponsorSlot = "Máster" | "Material esportivo" | "Manga" | "Costas" | "Naming rights";
/** `real` / `brandStatus` describe only the brand identity. Contract values are always simulated. */
export type Sponsor = { id: string; company: string; slot: SponsorSlot; weekly: number; until: string; real?: boolean; brandStatus?: DataStatus; brandSource?: string | undefined; sector?: string | undefined; bonusWin?: number | undefined; startedAt?: string | undefined };
export type SponsorOffer = { id: string; company: string; slot: SponsorSlot; weekly: number; weeks: number; expires: string; sector?: string | undefined; bonusWin?: number | undefined; countered?: boolean };

// ---------- deterministic random ----------
export function seeded(seed: string) {
  let v = 2166136261;
  for (const c of seed) v = Math.imul(v ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => { v = (Math.imul(v, 1664525) + 1013904223) >>> 0; return v / 4294967296; };
}

const FIRST = ["Lucas", "Gabriel", "Mateus", "Rafael", "Thiago", "Bruno", "Diego", "Caio", "Igor", "Vitor", "Pedro", "André", "Renan", "Danilo", "Felipe", "Hugo", "Marcos", "Wesley", "Gustavo", "Léo", "Matheus", "Kaio", "Éverton", "Rodrigo", "Yuri", "Luan", "Alex", "Vinícius", "Henrique", "Arthur", "Breno", "Davi"];
const LAST = ["Silva", "Santos", "Souza", "Oliveira", "Pereira", "Lima", "Costa", "Ribeiro", "Almeida", "Rocha", "Martins", "Barbosa", "Araújo", "Teixeira", "Moura", "Cardoso", "Nunes", "Freitas", "Gomes", "Vieira", "Mendes", "Batista", "Ramos", "Dias", "Pires", "Lopes"];

export function playerValue(rating: number, age: number) {
  const base = Math.pow(Math.max(rating - 55, 1), 2.6) * 2200;
  const ageMod = age <= 21 ? 1.5 : age <= 25 ? 1.25 : age <= 29 ? 1 : age <= 32 ? 0.6 : 0.3;
  return Math.round((base * ageMod) / 50_000) * 50_000;
}
export const playerWage = (rating: number) => Math.round(Math.pow(Math.max(rating - 50, 1), 2.2) * 90 / 1000) * 1000;

const LAYOUT: Pos[] = ["GOL", "GOL", "DEF", "DEF", "DEF", "DEF", "DEF", "DEF", "MEI", "MEI", "MEI", "MEI", "MEI", "MEI", "ATA", "ATA", "ATA", "ATA", "ATA", "DEF", "MEI", "GOL"];

export function generateSquad(clubId: string, rating: number, salt = "s1"): Player[] {
  const r = seeded(`${clubId}:${salt}`);
  return LAYOUT.map((pos, i) => {
    const starter = i < 19;
    const rt = Math.round(rating - (starter ? 6 : 12) + r() * (starter ? 11 : 9));
    const age = 18 + Math.floor(r() * 16);
    return {
      id: `${clubId}-${salt}-${i}`, clubId, pos, age, rating: rt,
      name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
      value: playerValue(rt, age), wage: playerWage(rt),
    };
  });
}

export function mapApiPos(p?: string): Pos {
  const u = (p ?? "").toLowerCase();
  if (u.startsWith("goal")) return "GOL";
  if (u.startsWith("def")) return "DEF";
  if (u.startsWith("att") || u.startsWith("for")) return "ATA";
  return "MEI";
}

export function squadFromApi(clubId: string, rating: number, api: { id: number | string; name: string; position?: string; age?: number | null }[]): Player[] {
  const r = seeded(`${clubId}:api`);
  return api.slice(0, 32).map((a) => {
    const age = a.age ?? 24;
    const rt = Math.round(rating - 7 + r() * 11 - (age < 20 ? 4 : 0));
    return { id: `${clubId}-api-${a.id}`, apiId: Number(a.id), clubId, name: a.name, pos: mapApiPos(a.position), age, ageUnknown: a.age == null, rating: rt, value: playerValue(rt, age), wage: playerWage(rt), real: true };
  });
}

// ---------- calendar ----------
export function makeFixtures(seed: string): Fixture[] {
  const ids = CLUBS.map((c) => c.id);
  const r = seeded(seed);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j]!, ids[i]!]; }
  const n = ids.length;
  const rounds: [string, string][][] = [];
  const arr = [...ids];
  for (let rd = 0; rd < n - 1; rd++) {
    const games: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i]!, b = arr[n - 1 - i]!;
      games.push(rd % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(games);
    arr.splice(1, 0, arr.pop()!);
  }
  const all = [...rounds, ...rounds.map((g) => g.map(([a, b]) => [b, a] as [string, string]))];
  const start = new Date("2025-03-29T00:00:00Z");
  return all.flatMap((games, rd) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + Math.floor(rd * 3.5));
    const date = d.toISOString().slice(0, 10);
    return games.map(([home, away]) => ({ round: rd + 1, date, home, away }));
  });
}

// ---------- table ----------
export type Row = { clubId: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number; form: ("V" | "E" | "D")[] };
export function computeTable(fixtures: Fixture[], ids?: string[]): Row[] {
  const participants = ids ?? (fixtures.length ? [...new Set(fixtures.flatMap(f => [f.home, f.away]))] : CLUBS.map(c => c.id));
  const rows = new Map<string, Row>(participants.map(id => [id, { clubId: id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }]));
  for (const f of fixtures) {
    if (f.hg == null || f.ag == null) continue;
    const h = rows.get(f.home), a = rows.get(f.away);
    if (!h || !a) continue;
    h.p++; a.p++; h.gf += f.hg; h.ga += f.ag; a.gf += f.ag; a.ga += f.hg;
    if (f.hg > f.ag) { h.w++; h.pts += 3; a.l++; h.form.push("V"); a.form.push("D"); }
    else if (f.hg < f.ag) { a.w++; a.pts += 3; h.l++; h.form.push("D"); a.form.push("V"); }
    else { h.d++; a.d++; h.pts++; a.pts++; h.form.push("E"); a.form.push("E"); }
  }
  return [...rows.values()].map((r) => ({ ...r, form: r.form.slice(-5) }))
    .sort((x, y) => y.pts - x.pts || y.w - x.w || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || clubById(x.clubId).name.localeCompare(clubById(y.clubId).name));
}

// ---------- strength ----------
export function bestEleven(squad: Player[], formation: CareerV2["formation"] = "4-3-3") {
  const [d, m, a] = formation.split("-").map(Number) as [number, number, number];
  const by = (p: Pos) => squad.filter((x) => x.pos === p).sort((x, y) => y.rating - x.rating);
  const pick = [...by("GOL").slice(0, 1), ...by("DEF").slice(0, d), ...by("MEI").slice(0, m), ...by("ATA").slice(0, a)];
  const rest = squad.filter((p) => !pick.includes(p)).sort((x, y) => y.rating - x.rating);
  while (pick.length < 11 && rest.length) pick.push(rest.shift()!);
  return pick;
}
export const teamRating = (squad: Player[], formation?: CareerV2["formation"]) => {
  const xi = bestEleven(squad, formation);
  return xi.length ? Math.round(xi.reduce((s, p) => s + p.rating, 0) / xi.length) : 60;
};

export function aiSquad(career: CareerV2, clubId: string) {
  const stored = career.otherSquads?.[clubId];
  if (stored) return stored.filter(p => p.clubId === clubId);
  const c = clubById(clubId);
  return generateSquad(clubId, c.rating).filter((p) => !career.transferredIn.includes(p.id));
}
export function aiRating(career: CareerV2, clubId: string) {
  return teamRating(aiSquad(career, clubId));
}

// ---------- create ----------
export function createCareer(manager: string, clubId: string, apiSquad?: Player[]): CareerV2 {
  const club = clubById(clubId);
  const squad = apiSquad && apiSquad.length >= 16 ? apiSquad : generateSquad(clubId, club.rating);
  const base: CareerV2 = {
    version: 2, manager, clubId, season: "2025", date: "2025-03-24", balance: club.budget,
    squad, fixtures: makeFixtures(`${clubId}:${manager}:2025`), market: [], offers: [], news: [],
    transferredIn: [], transferredOut: [], formation: "4-3-3",
    debt: startingDebt(clubId, club.debt).value, stadium: { capacity: club.capacity, ticketPrice: 60, level: 1 }, sponsors: initialSponsors(clubId), sponsorOffers: [], ledger: [],
  };
  base.finance = createFinance(base);
  base.market = refreshMarket(base, "2025-03-24");
  base.news = [{ id: "welcome", date: base.date, kind: "info", title: `${manager} é o novo técnico do ${club.name}!`, body: `A diretoria espera brigar na parte de cima da tabela. Orçamento disponível: ${money(club.budget)}.` }];
  return base;
}

export function refreshMarket(career: CareerV2, date: string): Player[] {
  const r = seeded(`market:${date}`);
  const pool: Player[] = [];
  for (const c of CLUBS) {
    if (c.id === career.clubId) continue;
    const sq = aiSquad(career, c.id);
    for (let i = 0; i < 2; i++) pool.push(sq[Math.floor(r() * sq.length)]!);
  }
  for (const club of career.worldClubs ?? []) {
    if (CLUBS.some(x => x.id === club.id)) continue;
    pool.push(...(career.otherSquads?.[club.id] ?? []).filter(p => !career.loans?.some(l => l.playerId === p.id)));
  }
  // free agents
  for (let i = 0; i < 6; i++) {
    const pos = (["GOL", "DEF", "MEI", "ATA"] as Pos[])[Math.floor(r() * 4)]!;
    const age = 27 + Math.floor(r() * 8); const rt = 64 + Math.floor(r() * 12);
    pool.push({ id: `fa-${date}-${i}`, clubId: "livre", pos, age, rating: rt, value: 0, wage: playerWage(rt), name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}` });
  }
  return [...new Map(pool.filter(p => p && !career.squad.some(x => x.id === p.id) && !career.loans?.some(l => l.playerId === p.id)).map((p) => [p.id, p])).values()].sort((a, b) => b.rating - a.rating);
}

export const money = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1_000_000 ? `R$ ${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(".", ",")} mi` : `R$ ${Math.round(a / 1000)} mil`;
  return v < 0 ? `-${s}` : s;
};

// ---------- flow ----------
export const nextFixture = (c: CareerV2) => allFixtures(c).find(f => f.hg == null && (f.home === c.clubId || f.away === c.clubId));
export const currentRound = (c: CareerV2) => leagueFixtures(c).filter(f => f.hg == null && (f.home === c.clubId || f.away === c.clubId)).sort((a,b) => a.date.localeCompare(b.date))[0]?.round ?? 39;

export function addDays(date: string, n: number) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/** Advance one day. Blocked on match day until the match is played. */
export function advanceDay(c: CareerV2, inPlace = false): { career: CareerV2; blocked?: string } {
  const nf = nextFixture(c);
  if (nf && c.date >= nf.date) return { career: c, blocked: "Hoje é dia de jogo! Jogue a partida para continuar." };
  const next: CareerV2 = inPlace ? c : structuredClone(c);
  next.date = addDays(c.date, 1);
  simulateDue(next, next.date);
  processMarketDay(next);
  const r = seeded(`day:${next.date}:${c.clubId}`);
  processFinanceDay(next); // wages, staff, sponsors, upkeep, installments and interest
  if (next.stadium.building && next.date >= next.stadium.building.until) {
    next.stadium.capacity += next.stadium.building.seats; next.stadium.level += 1;
    next.news.unshift({ id: `stad-${next.date}`, date: next.date, kind: "info", title: "Obra concluída no estádio!", body: `Capacidade agora: ${next.stadium.capacity.toLocaleString("pt-BR")} lugares.` });
    delete next.stadium.building;
  }
  next.sponsorOffers = next.sponsorOffers.filter((o) => o.expires >= next.date);
  if (r() < 0.12) addSponsorOffer(next, r);
  // expire offers
  next.offers = next.offers.filter((o) => o.expires >= next.date);
  // AI offer for one of your players
  if (r() < 0.22 && next.squad.length > 18) {
    const target = [...next.squad].sort((a, b) => b.rating - a.rating)[Math.floor(r() * 8)]!;
    const buyers = CLUBS.filter((x) => x.id !== c.clubId);
    const from = buyers[Math.floor(r() * buyers.length)]!;
    const fee = Math.round((target.value * (0.85 + r() * 0.5)) / 50_000) * 50_000;
    if (!next.offers.some((o) => o.playerId === target.id)) {
      const o: Offer = { id: `of-${next.date}-${target.id}`, playerId: target.id, fromClub: from.id, fee, expires: addDays(next.date, 3) };
      next.offers.unshift(o);
      next.news.unshift({ id: o.id, date: next.date, kind: "offer", title: `Proposta do ${from.name}`, body: `${from.name} oferece ${money(fee)} por ${target.name}. Responda no Mercado em até 3 dias.` });
    }
  }
  if (new Date(`${next.date}T00:00:00Z`).getUTCDay() === 1) next.market = refreshMarket(next, next.date);
  next.news = next.news.slice(0, 40);
  return { career: next };
}

export function advanceToMatch(c: CareerV2) {
  let cur = c; let guard = 0;
  const target = nextFixture(c)?.date;
  while (guard++ < 400 && target && cur.date < target) { const r = advanceDay(cur); if (r.blocked) break; cur = r.career; }
  return cur;
}

/** Record the user's match and simulate every other game of that round. */
export function completeRound(c: CareerV2, hg: number, ag: number, goals?: Goal[]): CareerV2 {
  const nf = nextFixture(c);
  if (!nf) return c;
  const next: CareerV2 = structuredClone(c);
  if (c.date < nf.date || !Number.isInteger(hg) || !Number.isInteger(ag) || hg < 0 || ag < 0) return c;
  const target = allFixtures(next).find(f => f.home === nf.home && f.away === nf.away && f.round === nf.round && f.competition === nf.competition);
  if (!target) return c;
  recordFixture(next, target, hg, ag, goals);
  simulateDue(next, nf.date);
  progressCup(next);
  const isHome = nf.home === c.clubId;
  const my = isHome ? hg : ag, opp = isHome ? ag : hg;
  const club = clubById(c.clubId);
  const gate = isHome ? gateIncome(c) : null;
  const award = my > opp ? 1_200_000 : my === opp ? 500_000 : 200_000;
  book(next, "premiacao", `Premiação · rodada ${nf.round}`, award);
  if (gate) book(next, "bilheteria", `Bilheteria · ${gate.attendance.toLocaleString("pt-BR")} torcedores`, gate.income);
  if (my > opp) for (const s of next.sponsors) if (s.bonusWin) book(next, "bonus_patrocinio", `Bônus por vitória · ${s.company}`, s.bonusWin);
  const prize = award + (gate?.income ?? 0);
  const oppClub = clubById(isHome ? nf.away : nf.home);
  next.news.unshift({ id: `res-${nf.round}`, date: next.date, kind: "result", title: `${my > opp ? "Vitória" : my === opp ? "Empate" : "Derrota"}: ${club.short} ${my} x ${opp} ${oppClub.short}`, body: `Rodada ${nf.round} do Brasileirão.${gate ? ` Público: ${gate.attendance.toLocaleString("pt-BR")}.` : ""} Receita: ${money(prize)}.` });
  // Use the regular daily path so contracts, loans and salary charges cannot be skipped.
  return advanceDay(next).career;
}

// ---------- transfers ----------
export function buyPlayer(c: CareerV2, playerId: string): { career: CareerV2; error?: string } {
  const p = c.market.find((x) => x.id === playerId);
  if (!p) return { career: c, error: "Jogador não está mais disponível." };
  if (c.squad.length >= 32) return { career: c, error: "Elenco cheio (máximo 32). Venda alguém primeiro." };
  const fee = p.clubId === "livre" ? 0 : Math.round(p.value * 1.1);
  if (fee > c.balance) return { career: c, error: `Saldo insuficiente. Precisa de ${money(fee)}.` };
  return transferPlayer(c, playerId, p.clubId, c.clubId, { kind: 'buy', fee, wage: p.wage, months: 24 });
}

export function sellPlayer(c: CareerV2, playerId: string, fee: number, toClub?: string): { career: CareerV2; error?: string } {
  if (c.squad.length <= 16) return { career: c, error: "Elenco mínimo de 16 jogadores." };
  const p = c.squad.find((x) => x.id === playerId);
  if (!p) return { career: c };
  const buyer = toClub ?? CLUBS.find(x => x.id !== c.clubId && aiSquad(c, x.id).length < 32 && (c.aiBalances?.[x.id] ?? x.budget) >= fee)?.id;
  if (!buyer) return { career: c, error: 'Nenhum clube comprador tem saldo ou vaga.' };
  return transferPlayer(c, playerId, c.clubId, buyer, { kind: 'buy', fee, wage: p.wage, months: 24 });
}


// ---------- finances ----------
export function ensureFields(c: CareerV2): CareerV2 {
  const club = clubById(c.clubId);
  const next = initializeSeason({
    ...c,
    debt: c.debt ?? club.debt,
    stadium: c.stadium ?? { capacity: club.capacity, ticketPrice: 60, level: 1 },
    sponsors: (c.sponsors ?? initialSponsors(c.clubId)).map(s => labelSponsor(c.clubId, s)),
    sponsorOffers: c.sponsorOffers ?? [],
    ledger: c.ledger ?? [],
    squad: c.squad.map(p => ({ ...p, contractUntil: p.contractUntil ?? addDays(c.date, 730) })),
    negotiations: c.negotiations ?? [], loans: c.loans ?? [], transferHistory: c.transferHistory ?? [], worldClubs: c.worldClubs ?? [], aiBalances: c.aiBalances ?? {},
  });
  finance(next); // older saves: existing debt becomes an installment contract, nothing is reset
  return next;
}

/** Keeps the "real" badge only where the brand matches the IBOPE Repucom 2025 map. */
function labelSponsor(clubId: string, s: Sponsor): Sponsor {
  const map = SPONSOR_MAP_2025[clubId];
  const verified = !!map && ((s.slot === "Máster" && s.company === map.master) || (s.slot === "Material esportivo" && s.company === map.kit));
  return { ...s, real: verified, brandStatus: verified ? "pesquisa" : s.brandStatus === "pesquisa" ? "simulado" : s.brandStatus ?? "simulado", brandSource: verified ? "ibope-2025" : undefined, sector: s.sector ?? SPONSOR_COMPANIES.find(x => x.name === s.company)?.sector };
}

function initialSponsors(clubId: string): Sponsor[] {
  const club = clubById(clubId);
  const map = SPONSOR_MAP_2025[clubId];
  const r = seeded(`sp:${clubId}`);
  const scale = club.rating >= 80 ? 1 : club.rating >= 75 ? 0.6 : 0.35;
  const pick = () => SPONSOR_COMPANIES[Math.floor(r() * SPONSOR_COMPANIES.length)]!;
  const sleeve = pick();
  const masterName = map?.master ?? pick().name;
  const list: Sponsor[] = [
    { id: "sp-master", company: masterName, slot: "Máster", weekly: Math.round(2_400_000 * scale / 1000) * 1000, until: "2025-12-31", bonusWin: Math.round(60_000 * scale / 1000) * 1000, startedAt: "2025-01-01" },
    { id: "sp-kit", company: map?.kit ?? KIT_BRANDS[Math.floor(r() * KIT_BRANDS.length)]!, slot: "Material esportivo", weekly: Math.round(1_300_000 * scale / 1000) * 1000, until: "2026-12-31", startedAt: "2025-01-01" },
    { id: "sp-sleeve", company: sleeve.name, slot: "Manga", weekly: Math.round(180_000 * scale / 1000) * 1000, until: "2025-09-30", startedAt: "2025-01-01" },
  ];
  return list.map(s => labelSponsor(clubId, s));
}

export const SLOT_BASE: Record<SponsorSlot, number> = { "Máster": 2_400_000, "Material esportivo": 1_300_000, "Manga": 180_000, "Costas": 300_000, "Naming rights": 900_000 };

function pickSector(r: () => number) {
  const entries = Object.entries(SECTOR_WEIGHTS_2025);
  let roll = r() * entries.reduce((t, [, w]) => t + w, 0);
  for (const [sector, w] of entries) { roll -= w; if (roll <= 0) return sector; }
  return "Outros";
}

function addSponsorOffer(c: CareerV2, r: () => number) {
  const taken = new Set(c.sponsors.map((s) => s.slot));
  const slots = (Object.keys(SLOT_BASE) as SponsorSlot[]).filter((s) => s !== "Material esportivo");
  const slot = slots[Math.floor(r() * slots.length)]!;
  const pos = computeTable(leagueFixtures(c)).findIndex((x) => x.clubId === c.clubId) + 1;
  const prestige = (clubById(c.clubId).rating - 60) / 25 + (pos > 0 && pos <= 6 ? 0.2 : 0);
  // Máster space is dominated by betting brands in 2025 (IBOPE Repucom); other spaces follow the sector mix.
  const sector = slot === "Máster" && r() < 0.65 ? "Apostas" : pickSector(r);
  const pool = SPONSOR_COMPANIES.filter((x) => x.sector === sector);
  const company = pool[Math.floor(r() * pool.length)]!.name;
  if (c.sponsors.some((s) => s.company === company) || c.sponsorOffers.some((o) => o.company === company)) return;
  const weekly = Math.round((SLOT_BASE[slot] * Math.max(0.25, prestige) * (0.8 + r() * 0.5)) / 1000) * 1000;
  const bonusWin = slot === "Máster" || slot === "Naming rights" ? Math.round(weekly * 0.03 / 1000) * 1000 : 0;
  const o: SponsorOffer = { id: `so-${c.date}-${slot}`, company, slot, sector, weekly, bonusWin, weeks: [20, 40, 52][Math.floor(r() * 3)]!, expires: addDays(c.date, 5) };
  c.sponsorOffers.unshift(o);
  c.news.unshift({ id: o.id, date: c.date, kind: "offer", title: `${company} quer patrocinar o clube`, body: `${slot}: ${money(weekly)}/semana por ${o.weeks} semanas${taken.has(slot) ? " (substitui o contrato atual)" : ""}. Proposta simulada. Veja em Clube › Patrocínio.` });
}

export function acceptSponsor(c: CareerV2, offerId: string): CareerV2 {
  const o = c.sponsorOffers.find((x) => x.id === offerId);
  if (!o) return c;
  const next = structuredClone(c);
  next.sponsors = next.sponsors.filter((s) => s.slot !== o.slot);
  next.sponsors.push({ id: `sp-${o.id}`, company: o.company, slot: o.slot, weekly: o.weekly, until: addDays(c.date, o.weeks * 7), sector: o.sector, bonusWin: o.bonusWin, startedAt: c.date, brandStatus: "simulado", real: false });
  next.sponsorOffers = next.sponsorOffers.filter((x) => x.id !== offerId);
  next.news.unshift({ id: `spok-${o.id}`, date: c.date, kind: "transfer", title: `Novo patrocínio: ${o.company}`, body: `${o.slot} · ${money(o.weekly)} por semana. Contrato simulado.` });
  return next;
}

/** One counter-proposal per offer: the company accepts +12% or walks away (deterministic per offer). */
export function counterSponsor(c: CareerV2, offerId: string): { career: CareerV2; accepted: boolean } {
  const o = c.sponsorOffers.find((x) => x.id === offerId);
  if (!o || o.countered) return { career: c, accepted: false };
  const next = structuredClone(c);
  const accepted = seeded(`counter:${o.id}:${c.clubId}`)() < 0.55;
  if (accepted) next.sponsorOffers = next.sponsorOffers.map((x) => x.id === offerId ? { ...x, weekly: Math.round(x.weekly * 1.12 / 1000) * 1000, countered: true } : x);
  else next.sponsorOffers = next.sponsorOffers.filter((x) => x.id !== offerId);
  return { career: next, accepted };
}

export const SPONSOR_EXIT_FEE = 0.25;
export function sponsorExitFee(c: CareerV2, s: Sponsor) {
  const weeks = Math.max(0, Math.ceil((Date.parse(`${s.until}T00:00:00Z`) - Date.parse(`${c.date}T00:00:00Z`)) / (7 * 86_400_000)));
  return Math.round(weeks * s.weekly * SPONSOR_EXIT_FEE);
}
export function cancelSponsor(c: CareerV2, sponsorId: string): { career: CareerV2; error?: string } {
  const s = c.sponsors.find((x) => x.id === sponsorId);
  if (!s) return { career: c, error: "Contrato não encontrado." };
  if (s.slot === "Material esportivo") return { career: c, error: "O contrato de material esportivo não pode ser rescindido no meio da temporada." };
  const fee = sponsorExitFee(c, s);
  if (fee > c.balance) return { career: c, error: `Multa rescisória de ${money(fee)} maior que o caixa.` };
  const next = structuredClone(c);
  next.sponsors = next.sponsors.filter((x) => x.id !== sponsorId);
  book(next, "multas", `Rescisão com ${s.company}`, -fee);
  return { career: next };
}

export const currentWeek = ledgerWeek;

export function payDebt(c: CareerV2, amount: number, debtId?: string): { career: CareerV2; error?: string } {
  return amortize(c, amount, debtId);
}

export function gateIncome(c: CareerV2) {
  const table = computeTable(leagueFixtures(c));
  const pos = table.findIndex((r) => r.clubId === c.clubId) + 1;
  const hype = 0.95 - (pos - 1) * 0.015;
  const priceFactor = Math.max(0.25, 1.25 - c.stadium.ticketPrice / 160);
  const fill = Math.max(0.2, Math.min(1, hype * priceFactor));
  const attendance = Math.round(c.stadium.capacity * fill);
  return { attendance, fill, income: attendance * c.stadium.ticketPrice };
}

export const EXPANSION = { seats: 5000, cost: 25_000_000, days: 60 };
export function expandStadium(c: CareerV2): { career: CareerV2; error?: string } {
  if (c.stadium.building) return { career: c, error: "Já existe uma obra em andamento." };
  if (c.balance < EXPANSION.cost) return { career: c, error: `Precisa de ${money(EXPANSION.cost)} em caixa.` };
  const next = structuredClone(c);
  next.stadium.building = { until: addDays(c.date, EXPANSION.days), seats: EXPANSION.seats };
  book(next, "obras", "Obra de ampliação do estádio", -EXPANSION.cost);
  return { career: next };
}
